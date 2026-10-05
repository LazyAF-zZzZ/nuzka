using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows.Input;
using System.Windows.Threading;
using RovOverlay.Desktop.Core;
using RovOverlay.Desktop.Models;
using RovOverlay.Desktop.Services;

namespace RovOverlay.Desktop.ViewModels;

// One option in a drop-down whose label follows the app language.
public sealed class SceneChoice(string group, string key) : ObservableObject
{
    public string Key { get; } = key;
    public string Label => Loc.T($"Scenes.{group}.{Key}");
    public void Refresh() => OnPropertyChanged(nameof(Label));

    // The closed drop-down shows ToString() when its selection arrives through SelectedValue
    // before the item template exists, which printed the class name in the first snapshot.
    public override string ToString() => Label;
}

// The "Scenes and lower third" card of the Control Panel: the lower third bar, the Starting
// soon countdown, the animated background shared by the break scenes, and their wording.
// It holds no rules of its own. Everything is a socket command the server cleans
// (domain/broadcast.ts), and what it shows is read back from the overlay state.
public sealed class BroadcastViewModel : ObservableObject
{
    public static readonly string[] StyleKeys = ["aurora", "bokeh", "synthgrid", "speedlines", "hexpulse", "waves"];
    public static readonly string[] PaletteKeys =
    [
        "theme", "neon-violet", "cyber-teal", "esports-red", "royal-gold", "deep-ocean", "sunset-drive",
        "toxic-lime", "ice", "magma", "corporate-blue", "pink-candy", "emerald"
    ];

    public static readonly string[] TargetKeys = ["all", "starting", "brb", "ending", "vs"];

    private readonly Action<string, object?> _emit;
    private readonly Debouncer _textSave = new();
    private readonly Debouncer _qualitySave = new();
    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromMilliseconds(500) };
    private bool _applying;
    private bool _seeded;
    private BroadcastState _state = new();

    private string _minutes = "10";
    private string _countLabel = "";
    private string _startingTitle = "";
    private string _brbTitle = "";
    private string _brbSubtitle = "";
    private string _endingTitle = "";
    private string _endingSubtitle = "";
    private string _target = "all";
    private string _style = "aurora";
    private string _palette = "theme";
    private int _quality = 75;
    private bool _showTexts;
    private string _countdownText = "";

    public BroadcastViewModel(Action<string, object?> emit)
    {
        _emit = emit;
        foreach (var key in StyleKeys) Styles.Add(new SceneChoice("Style", key));
        foreach (var key in PaletteKeys) Palettes.Add(new SceneChoice("Palette", key));
        foreach (var key in TargetKeys) Targets.Add(new SceneChoice("Target", key));
        _clock.Tick += (_, _) => RefreshCountdown();

        AddCardCommand = new RelayCommand(() => _emit("addLowerThird", null));
        StartCountdownCommand = new RelayCommand(StartCountdown);
        StopCountdownCommand = new RelayCommand(() => _emit("stopCountdown", null));
        RerollCommand = new RelayCommand(() => Send("seed", Random.Shared.Next(1, 999999)));
        UseSharedCommand = new RelayCommand(() => _emit("updateBackground", new { scene = _target, reset = true }));
        ToggleTextsCommand = new RelayCommand(() => ShowTexts = !ShowTexts);

        Loc.Instance.Changed += OnLanguageChanged;
        RefreshCountdown();
    }

    public ObservableCollection<SceneChoice> Styles { get; } = new();
    public ObservableCollection<SceneChoice> Palettes { get; } = new();
    public ObservableCollection<SceneChoice> Targets { get; } = new();

    public ICommand AddCardCommand { get; }
    public ICommand StartCountdownCommand { get; }
    public ICommand StopCountdownCommand { get; }
    public ICommand RerollCommand { get; }
    public ICommand UseSharedCommand { get; }
    public ICommand ToggleTextsCommand { get; }

    // ---- lower third ------------------------------------------------------

    // One card per bar on the Lower third source, in the order the server keeps them (first = bottom of the stack).
    public ObservableCollection<LowerThirdCard> Cards { get; } = new();
    public bool CanAddCard => Cards.Count < MaxCards;
    public const int MaxCards = 4;

    // Called by a card to send its own command; the index is where it sits now.
    public void EmitCard(string command, int index, object? fields = null)
    {
        var payload = new Dictionary<string, object?> { ["index"] = index };
        if (fields is not null)
        {
            foreach (var p in fields.GetType().GetProperties()) payload[p.Name] = p.GetValue(fields);
        }
        _emit(command, payload);
    }

    // Bring the cards in line with the server's list. Cards that already exist keep what is typed in
    // them (the operator may be mid-sentence); a new card starts from the server's text.
    private void SyncCards(BroadcastState state)
    {
        var added = false;
        while (Cards.Count < state.LowerThirds.Count)
        {
            Cards.Add(new LowerThirdCard(this, Cards.Count, state.LowerThirds[Cards.Count]));
            added = true;
        }
        var removed = false;
        while (Cards.Count > state.LowerThirds.Count)
        {
            Cards.RemoveAt(Cards.Count - 1);
            removed = true;
        }
        for (var i = 0; i < Cards.Count; i++) Cards[i].Apply(state.LowerThirds[i], Cards.Count);
        if (added || removed) OnPropertyChanged(nameof(CanAddCard));
    }

    // ---- countdown --------------------------------------------------------

    public string Minutes { get => _minutes; set => Set(ref _minutes, value ?? ""); }
    public string CountdownLabel { get => _countLabel; set => Set(ref _countLabel, value ?? ""); }
    public string CountdownText { get => _countdownText; private set => Set(ref _countdownText, value); }
    public bool CountdownRunning => _state.CountdownEndsAt is not null;

    private void StartCountdown()
    {
        // Minutes may be fractional ("0.5" = 30 s). Unreadable input starts nothing rather than guessing.
        if (!double.TryParse(Minutes.Trim().Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var minutes)
            || minutes <= 0) return;
        _emit("startCountdown", new { seconds = (int)Math.Round(minutes * 60), label = CountdownLabel });
    }

    private void RefreshCountdown()
    {
        if (_state.CountdownEndsAt is not { } ends)
        {
            CountdownText = Loc.T("Scenes.CountIdle");
            return;
        }
        var left = (int)Math.Ceiling((ends - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) / 1000.0);
        if (left <= 0)
        {
            CountdownText = Loc.T("Scenes.CountDone");
            _clock.Stop();
            return;
        }
        CountdownText = left >= 3600
            ? $"{left / 3600}:{left % 3600 / 60:00}:{left % 60:00}"
            : $"{left / 60:00}:{left % 60:00}";
    }

    // ---- background -------------------------------------------------------

    // Which scene the controls below edit: "all", or one of the four. The values shown are what that
    // scene really uses, and a change is sent for that scene only ("all" moves every scene).
    public string Target
    {
        get => _target;
        set
        {
            if (!Set(ref _target, value ?? "all")) return;
            OnPropertyChanged(nameof(TargetIsScene));
            OnPropertyChanged(nameof(TargetHasOverride));
            ShowEffective();
        }
    }

    public bool TargetIsScene => _target != "all";
    public bool TargetHasOverride => TargetIsScene && _state.HasOverride(_target);

    // "all" carries no scene key: the server reads a missing scene as every scene.
    private void Send(string key, object value)
    {
        var fields = new Dictionary<string, object> { [key] = value };
        if (TargetIsScene) fields["scene"] = _target;
        _emit("updateBackground", fields);
    }

    private void ShowEffective()
    {
        var (style, palette, quality) = _state.Effective(_target);
        var before = _applying;
        _applying = true;
        try
        {
            Style = style;
            Palette = palette;
            Quality = (int)Math.Round(quality * 100);
        }
        finally
        {
            _applying = before;
        }
    }

    public string Style
    {
        get => _style;
        set
        {
            if (!Set(ref _style, value) || _applying) return;
            Send("style", value);
        }
    }

    public string Palette
    {
        get => _palette;
        set
        {
            if (!Set(ref _palette, value) || _applying) return;
            Send("palette", value);
        }
    }

    // Percent, 25..100. The server keeps it as 0.25..1.
    public int Quality
    {
        get => _quality;
        set
        {
            if (!Set(ref _quality, Math.Clamp(value, 25, 100)) || _applying) return;
            _qualitySave.Run(() => Send("quality", _quality / 100.0));
            OnPropertyChanged(nameof(QualityText));
        }
    }

    public string QualityText => $"{_quality}%";

    // ---- scene wording ----------------------------------------------------

    public bool ShowTexts { get => _showTexts; set => Set(ref _showTexts, value); }

    public string StartingTitle { get => _startingTitle; set => SetText(ref _startingTitle, value); }
    public string BrbTitle { get => _brbTitle; set => SetText(ref _brbTitle, value); }
    public string BrbSubtitle { get => _brbSubtitle; set => SetText(ref _brbSubtitle, value); }
    public string EndingTitle { get => _endingTitle; set => SetText(ref _endingTitle, value); }
    public string EndingSubtitle { get => _endingSubtitle; set => SetText(ref _endingSubtitle, value); }

    private void SetText(ref string field, string? value, [System.Runtime.CompilerServices.CallerMemberName] string? name = null)
    {
        if (!Set(ref field, value ?? "", name) || _applying) return;
        // All five go out together: the server merges, so a half-typed box never wipes the others.
        _textSave.Run(() => _emit("updateSceneText", new
        {
            startingTitle = _startingTitle,
            brbTitle = _brbTitle,
            brbSubtitle = _brbSubtitle,
            endingTitle = _endingTitle,
            endingSubtitle = _endingSubtitle
        }));
    }

    // ---- state ------------------------------------------------------------

    // Called for every overlay push, once a second while a draft runs. Only the first one fills
    // the text boxes, and later ones leave them alone: the operator may be mid-sentence, and
    // the server never changes these on its own.
    public void Apply(BroadcastState state)
    {
        var before = _state;
        _state = state;
        _applying = true;
        try
        {
            ShowEffective();
            if (!_seeded)
            {
                _seeded = true;
                CountdownLabel = state.CountdownLabel;
                StartingTitle = state.StartingTitle;
                BrbTitle = state.BrbTitle;
                BrbSubtitle = state.BrbSubtitle;
                EndingTitle = state.EndingTitle;
                EndingSubtitle = state.EndingSubtitle;
            }
        }
        finally
        {
            _applying = false;
        }

        if (before.HasOverride(_target) != state.HasOverride(_target)) OnPropertyChanged(nameof(TargetHasOverride));
        SyncCards(state);
        if (before.CountdownEndsAt != state.CountdownEndsAt)
        {
            OnPropertyChanged(nameof(CountdownRunning));
            if (state.CountdownEndsAt is null) _clock.Stop();
            else _clock.Start();
        }
        RefreshCountdown();
    }

    private void OnLanguageChanged()
    {
        foreach (var choice in Styles) choice.Refresh();
        foreach (var choice in Palettes) choice.Refresh();
        foreach (var choice in Targets) choice.Refresh();
        foreach (var card in Cards) card.Refresh();
        RefreshCountdown();
    }
}

// One lower third bar. Its text boxes are the operator's until Show or Update is pressed, so a push
// from the server never overwrites them; only the on-air state follows the server.
public sealed class LowerThirdCard : ObservableObject
{
    private readonly BroadcastViewModel _owner;
    private int _index;
    private int _count = 1;
    private bool _on;
    private string _name;
    private string _title;
    private string _handle;

    public LowerThirdCard(BroadcastViewModel owner, int index, LowerThirdState seed)
    {
        _owner = owner;
        _index = index;
        _name = seed.Name;
        _title = seed.Title;
        _handle = seed.Handle;
        _on = seed.Visible;
        ShowCommand = new RelayCommand(() => _owner.EmitCard("updateLowerThird", _index,
            new { visible = true, name = Name, title = Title, handle = Handle }));
        HideCommand = new RelayCommand(() => _owner.EmitCard("updateLowerThird", _index, new { visible = false }));
        RemoveCommand = new RelayCommand(() => _owner.EmitCard("removeLowerThird", _index));
    }

    public ICommand ShowCommand { get; }
    public ICommand HideCommand { get; }
    public ICommand RemoveCommand { get; }

    public string Name { get => _name; set => Set(ref _name, value ?? ""); }
    public string Title { get => _title; set => Set(ref _title, value ?? ""); }
    public string Handle { get => _handle; set => Set(ref _handle, value ?? ""); }

    public string Heading => Loc.F("Scenes.Card", _index + 1);
    public bool IsOn => _on;
    // "Show" while hidden, "Update" while on air: the same command, said the way it will behave.
    public string ShowText => Loc.T(_on ? "Scenes.UpdateLt" : "Scenes.ShowLt");
    public string Status => Loc.T(_on ? "Scenes.LtOn" : "Scenes.LtOff");
    // The last card cannot go: it clears and hides instead, which the server does.
    public bool CanRemove => _count > 1;

    public void Apply(LowerThirdState state, int count)
    {
        if (_on != state.Visible)
        {
            _on = state.Visible;
            OnPropertyChanged(nameof(IsOn));
            OnPropertyChanged(nameof(ShowText));
            OnPropertyChanged(nameof(Status));
        }
        if (_count != count)
        {
            _count = count;
            OnPropertyChanged(nameof(CanRemove));
        }
    }

    public void Refresh()
    {
        OnPropertyChanged(nameof(Heading));
        OnPropertyChanged(nameof(ShowText));
        OnPropertyChanged(nameof(Status));
    }
}
