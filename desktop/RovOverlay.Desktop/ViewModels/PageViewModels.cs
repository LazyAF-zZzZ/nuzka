using System.Collections.ObjectModel;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows.Input;
using RovOverlay.Desktop.Core;
using RovOverlay.Desktop.Models;
using RovOverlay.Desktop.Services;

namespace RovOverlay.Desktop.ViewModels;

public sealed class ObsSourceRow : ObservableObject
{
    // Same list and order as v2's public/js/lib/obs-sources.js. The per-tournament ones
    // take ?tournament=<id> when copied from a tournament's own page.
    private static readonly (string Name, string Path, string? Size, bool Sfx, bool PerTournament)[] Sources =
    [
        ("Overlay 1080p", "/overlay", "1920 × 1080", true, false),
        ("Overlay 1440p", "/overlay-1440", "2560 × 1440", true, false),
        ("Result", "/result", null, false, false),
        ("Previous picks & bans", "/overlay-prev", null, false, false),
        ("Standings", "/overlay-standings", null, false, true),
        ("Head to head", "/overlay-matchup", null, false, false),
        ("Team picks & bans", "/overlay-team-drafts", null, false, false),
        // One card per side. It follows whichever team is on that side now, so when the
        // teams swap after a game the two cards swap with them.
        ("Team card, blue side", "/overlay-team-card?side=blue", null, false, false),
        ("Team card, red side", "/overlay-team-card?side=red", null, false, false),
        ("Team list", "/overlay-teams", null, false, true),
        ("Stats board", "/overlay-analytics", null, false, true)
    ];

    private readonly string? _size;

    private ObsSourceRow(AppServices services, string name, string route, string? size, bool hasSfx)
    {
        Name = name;
        _size = size;
        HasSfx = hasSfx;
        Url = services.Url(route);
        CopyCommand = new RelayCommand(() => Clip.Copy(Url));
        OpenCommand = new RelayCommand(() => Browser.Open(Url));
        Loc.Instance.Changed += () => OnPropertyChanged(nameof(SizeText));
    }

    public static IReadOnlyList<ObsSourceRow> Create(AppServices services) =>
        Sources.Select(s => new ObsSourceRow(services, s.Name, s.Sfx ? s.Path + "?sfx=1" : s.Path, s.Size, s.Sfx)).ToList();

    public static IReadOnlyList<ObsSourceRow> CreateForTournament(AppServices services, string tournamentId) =>
        Sources.Where(s => s.PerTournament)
            .Select(s => new ObsSourceRow(services, s.Name, $"{s.Path}?tournament={Uri.EscapeDataString(tournamentId)}", s.Size, s.Sfx))
            .ToList();

    public string Name { get; }
    public string Url { get; }

    // Sound is opt-in per URL: only the source carrying ?sfx=1 plays, or the 1080p
    // overlay, the 1440p overlay and the result screen would all echo each other.
    // Which ones those are is impossible to tell from the list otherwise.
    public bool HasSfx { get; }
    public string SizeText => _size ?? Loc.T("Obs.SameSize");
    public ICommand CopyCommand { get; }
    public ICommand OpenCommand { get; }
}

public sealed class SettingsViewModel : ObservableObject
{
    private readonly AppServices _services;
    private string _logText = "";

    public SettingsViewModel(AppServices services, ShellViewModel shell)
    {
        _services = services;
        Supporter = new SupporterPanel(services);
        OpenSupportCommand = new RelayCommand(() => shell.NavigateTo("Support"));
        RefreshAutoBackupsCommand = new AsyncRelayCommand(LoadAutoBackupsAsync);
        OpenBackupFolderCommand = new RelayCommand(() => { if (_backupFolder.Length > 0) Browser.OpenFolder(_backupFolder); },
            () => _backupFolder.Length > 0);
        // The server writes a backup a minute after data changes, so the list is read again
        // a little after that, and whenever the connection comes back.
        _services.DataChanged += c =>
        {
            if (c.Topic is "teams" or "tournaments" or "roster" or "matches" or "games" or "fonts") _backupsLater.Run(() => _ = SafeLoadAutoBackupsAsync());
        };
        _services.ConnectionChanged += up => { if (up) _ = SafeLoadAutoBackupsAsync(); };
        _ = SafeLoadAutoBackupsAsync();
        RefreshLogCommand = new RelayCommand(RefreshLog);
        SaveBackupCommand = new AsyncRelayCommand(SaveBackupAsync);
        RestoreCommand = new AsyncRelayCommand(RestoreAsync);
        CheckUpdateCommand = new AsyncRelayCommand(() => Updates.CheckAsync(manual: true));
        Loc.Instance.Changed += () =>
        {
            OnPropertyChanged(nameof(Language));
            OnPropertyChanged(nameof(ModeText));
        };
        RefreshLog();
    }

    // ---- Automatic backups (backend/server/services/auto-backup.ts) ------------

    private readonly Debouncer _backupsLater = new(70_000);
    private string _backupFolder = "";
    private int _moreBackups;

    public ObservableCollection<AutoBackupRow> AutoBackups { get; } = new();
    public ICommand RefreshAutoBackupsCommand { get; }
    public ICommand OpenBackupFolderCommand { get; }
    public bool HasAutoBackups => AutoBackups.Count > 0;
    public string MoreBackupsText => _moreBackups > 0 ? Loc.F("AutoBackup.More", _moreBackups) : "";

    private async Task SafeLoadAutoBackupsAsync()
    {
        try { await LoadAutoBackupsAsync(); } catch { /* the server may still be starting; the next change retries */ }
    }

    // The newest five are listed; the rest are in the folder.
    private async Task LoadAutoBackupsAsync()
    {
        if (_services.Api is null) return;
        var list = await _services.Api.GetAsync<AutoBackupList>("/api/backup/auto");
        _backupFolder = list.Folder ?? "";
        AutoBackups.Clear();
        foreach (var b in list.Backups.Take(5)) AutoBackups.Add(new AutoBackupRow(b, RestoreAutoBackupAsync));
        _moreBackups = Math.Max(0, list.Backups.Count - 5);
        OnPropertyChanged(nameof(HasAutoBackups));
        OnPropertyChanged(nameof(MoreBackupsText));
        CommandManager.InvalidateRequerySuggested();
    }

    private async Task RestoreAutoBackupAsync(AutoBackup backup)
    {
        string[] body =
        [
            Loc.F("AutoBackup.RestoreBody", AutoBackupRow.When(backup.At), backup.Teams, backup.Tournaments),
            Loc.T("Backup.MergeRule"),
            Loc.T("AutoBackup.Undo")
        ];
        if (!Dialogs.Confirm(Loc.T("AutoBackup.RestoreTitle"), body, Loc.T("Backup.Restore"))) return;
        var reply = await _services.Api.PostAsync<RestoreReply>($"/api/backup/auto/{Uri.EscapeDataString(backup.Name)}/restore", null);
        Toasts.Info(Loc.F("Backup.Restored", reply.Report.TeamsAdded, reply.Report.TournamentsAdded));
        await LoadAutoBackupsAsync();
    }

    // ---- Supporter (docs/PLAN.md §10) --------------------------------------

    // Status, key box and remove: shared with the Support screen, which is where
    // "Become a supporter" goes.
    public SupporterPanel Supporter { get; }
    public ICommand OpenSupportCommand { get; }

    public string Language
    {
        get => Loc.Instance.Language;
        set => Loc.Instance.Language = value;
    }

    public string ServerUrl => _services.Backend.BaseUri.ToString().TrimEnd('/');
    public string ModeText => Loc.T(_services.Backend.Attached ? "Settings.ModeAttached" : "Settings.ModeOwned");
    public string NodePath => _services.Backend.NodePath ?? "—";
    public string BackendDir => _services.Backend.BackendDir ?? "—";
    public string Version => AppVersion.Text;

    public string LogText { get => _logText; private set => Set(ref _logText, value); }

    public ICommand RefreshLogCommand { get; }
    public ICommand SaveBackupCommand { get; }
    public ICommand RestoreCommand { get; }
    public ICommand CheckUpdateCommand { get; }

    // ---- Updates ----------------------------------------------------------

    public UpdateService Updates => _services.Updates;

    // Saved as it is chosen: the next check reads it, so there is nothing to apply.
    public string UpdateChannel
    {
        get => _services.Settings.UpdateChannel;
        set
        {
            if (_services.Settings.UpdateChannel == value) return;
            _services.Settings.UpdateChannel = value;
            _services.Settings.Save();
            OnPropertyChanged();
        }
    }

    private void RefreshLog() => LogText = string.Join(Environment.NewLine, _services.Backend.RecentLog());

    // Everything on this machine as one JSON file: teams, logos, tournaments, brackets,
    // every recorded draft. Same file format as v2, so a v2 backup restores here.
    private async Task SaveBackupAsync()
    {
        var path = Dialogs.PickSave($"rov-overlay-backup-{DateTime.Now:yyyy-MM-dd}.json", $"{Loc.T("Dialog.Json")} (*.json)|*.json");
        if (path is null) return;

        var text = await _services.Api.GetTextAsync("/api/backup");
        await File.WriteAllTextAsync(path, text, new UTF8Encoding(false));
        Toasts.Info(Loc.F("Backup.Saved", Path.GetFileName(path)));
    }

    // Always a merge: what is already here stays, duplicates are skipped. The server's
    // preview says what the file holds before anything is written.
    private async Task RestoreAsync()
    {
        var path = Dialogs.PickOpen($"{Loc.T("Dialog.Json")} (*.json)|*.json");
        if (path is null) return;

        string text;
        try
        {
            text = await File.ReadAllTextAsync(path);
            using var _ = JsonDocument.Parse(text);
        }
        catch
        {
            Toasts.Error(Loc.T("Backup.NotJson"));
            return;
        }

        var preview = await _services.Api.PostJsonTextAsync<BackupPreview>("/api/backup/preview", text);
        var s = preview.Summary;
        var made = string.IsNullOrEmpty(s.ExportedAt) ? "?" : s.ExportedAt[..Math.Min(10, s.ExportedAt.Length)];
        var body = new List<string>
        {
            Loc.F("Backup.WillAdd", s.Teams, s.Tournaments),
            Loc.F("Backup.Contents", s.Matches, s.Drafts, s.Logos, made)
        };
        if (s.Fonts > 0) body.Add(Loc.F("Backup.Fonts", s.Fonts));
        if (s.FontsLeftOut > 0) body.Add(Loc.F("Backup.FontsLeftOut", s.FontsLeftOut));
        if (preview.AlreadyHere.Teams > 0 || preview.AlreadyHere.Tournaments > 0)
            body.Add(Loc.F("Backup.AlreadyHere", preview.AlreadyHere.Teams, preview.AlreadyHere.Tournaments));
        body.Add(Loc.T("Backup.MergeRule"));

        if (!Dialogs.Confirm(Loc.T("Backup.RestoreTitle"), body, Loc.T("Backup.Restore"))) return;

        var reply = await _services.Api.PostJsonTextAsync<RestoreReply>("/api/backup/restore", "{\"file\":" + text + ",\"mode\":\"merge\"}");
        Toasts.Info(Loc.F("Backup.Restored", reply.Report.TeamsAdded, reply.Report.TournamentsAdded));
    }
}

// One automatic backup in the Settings list: when, what it holds, and a Restore button.
public sealed class AutoBackupRow
{
    public AutoBackupRow(AutoBackup backup, Func<AutoBackup, Task> restore)
    {
        Backup = backup;
        RestoreCommand = new AsyncRelayCommand(() => restore(backup));
    }

    public AutoBackup Backup { get; }
    public ICommand RestoreCommand { get; }
    public string WhenText => When(Backup.At);
    public string ContentsText => Loc.F("AutoBackup.Contents", Backup.Teams, Backup.Tournaments, Backup.Matches, Backup.Drafts);

    // Local time, in the app's language: "28 Sept 2026, 19:15" or "28 ก.ย. 2569 19:15".
    public static string When(long at) =>
        DateTimeOffset.FromUnixTimeMilliseconds(at).ToLocalTime().ToString("d MMM yyyy  HH:mm", Loc.Instance.Culture);
}
