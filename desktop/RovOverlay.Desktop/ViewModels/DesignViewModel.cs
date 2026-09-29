using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Windows.Input;
using System.Windows.Media;
using RovOverlay.Desktop.Core;
using RovOverlay.Desktop.Models;
using RovOverlay.Desktop.Services;

namespace RovOverlay.Desktop.ViewModels;

// One overlay whose parts can be moved (backend/public/js/overlay-layout.js). Key is the
// page's data-layout-scene; Route is where its editor opens.
public sealed class LayoutSceneRow(string key, string route, string labelKey) : ObservableObject
{
    public string Key { get; } = key;
    public string Route { get; } = route;
    public int Moved { get; private set; }
    public string Label => Moved == 0 ? Loc.T(labelKey) : $"{Loc.T(labelKey)}  ·  {Loc.F("Layout.MovedShort", Moved)}";

    public void Apply(int moved)
    {
        if (moved == Moved) return;
        Moved = moved;
        OnPropertyChanged(nameof(Moved));
        OnPropertyChanged(nameof(Label));
    }

    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// One background image the overlay can wear. The file name is fixed by the server
// (backend/server/domain/media.ts), so a slot is a slot, never a user-typed path.
public sealed class SkinSlotRow : ObservableObject
{
    private static readonly HttpClient Probe = new() { Timeout = TimeSpan.FromSeconds(3) };
    private readonly DesignViewModel _owner;
    private string? _previewUrl;
    private long _version;

    public SkinSlotRow(DesignViewModel owner, string key, string file, string group, string part, int width, int height, string noteKey)
    {
        _owner = owner;
        Key = key;
        File = file;
        Group = group;
        Part = part;
        Width = width;
        Height = height;
        NoteKey = noteKey;
        UploadCommand = new AsyncRelayCommand(() => owner.UploadAsync(this));
        ClearCommand = new AsyncRelayCommand(() => owner.ClearAsync(this));
    }

    public string Key { get; }
    public string File { get; }
    public string Group { get; }
    public string Part { get; }
    public int Width { get; }
    public int Height { get; }
    public string NoteKey { get; }
    public string Note => Loc.T(NoteKey);
    public string SizeText => $"W {Width} × H {Height} px";
    public string RatioText => $"{(double)Width / Height:0.00} : 1";
    public string FileText => $"{File}.png";
    public ICommand UploadCommand { get; }
    public ICommand ClearCommand { get; }

    public string? PreviewUrl { get => _previewUrl; private set => Set(ref _previewUrl, value); }
    public bool HasImage => PreviewUrl is not null;

    // The state carries a version stamp, not the file type, so the three allowed types
    // are probed in turn. Cheap: it is a request to a server on this machine.
    public async Task ApplyAsync(long version, AppServices services)
    {
        if (version == _version) return;
        _version = version;

        if (version == 0)
        {
            PreviewUrl = null;
            OnPropertyChanged(nameof(HasImage));
            return;
        }

        foreach (var ext in new[] { "png", "jpg", "webp" })
        {
            var url = services.Url($"/images/skins/{File}.{ext}?v={version}");
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Head, url);
                using var reply = await Probe.SendAsync(request);
                if (!reply.IsSuccessStatusCode) continue;
                PreviewUrl = url;
                OnPropertyChanged(nameof(HasImage));
                return;
            }
            catch
            {
                // Try the next extension.
            }
        }

        PreviewUrl = null;
        OnPropertyChanged(nameof(HasImage));
    }

    public void RefreshText()
    {
        OnPropertyChanged(nameof(Note));
    }
}

public sealed class ThemeColorRow : ObservableObject
{
    private readonly DesignViewModel _owner;
    private string _hex = "#000000";

    public ThemeColorRow(DesignViewModel owner, string key, string labelKey, string fallback)
    {
        _owner = owner;
        Key = key;
        LabelKey = labelKey;
        Default = fallback;
        _hex = fallback;
    }

    public string Key { get; }
    public string LabelKey { get; }
    public string Default { get; }
    public string Label => Loc.T(LabelKey);
    public bool IsChanged => !string.Equals(_hex, Default, StringComparison.OrdinalIgnoreCase);

    public string Hex
    {
        get => _hex;
        set
        {
            var text = (value ?? "").Trim().ToLowerInvariant();
            if (!Set(ref _hex, text)) return;
            OnPropertyChanged(nameof(Swatch));
            OnPropertyChanged(nameof(IsValid));
            OnPropertyChanged(nameof(IsChanged));
            if (IsValid) _owner.PushTheme(Key, text);
        }
    }

    public bool IsValid => System.Text.RegularExpressions.Regex.IsMatch(_hex, "^#[0-9a-f]{6}$");

    public Brush Swatch => IsValid
        ? new SolidColorBrush((Color)ColorConverter.ConvertFromString(_hex))
        : Brushes.Transparent;

    public void Apply(string hex)
    {
        if (string.Equals(hex, _hex, StringComparison.OrdinalIgnoreCase)) return;
        _hex = hex.ToLowerInvariant();
        foreach (var name in new[] { nameof(Hex), nameof(Swatch), nameof(IsValid), nameof(IsChanged) }) OnPropertyChanged(name);
    }

    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// หนึ่งหน้าบนจอ Design (ผู้ใช้ขอให้จัดตามหน้า 2026-09-29)
//
// ตัวเลือกเดียวนี้คุมทั้ง Layout, Fonts และการตั้งค่าเฉพาะหน้า
// ก่อนหน้านี้มีตัวเลือกหน้าอยู่สองที่ (ฉากของ Layout กับ "ใช้กับ" ของ Fonts)
// ซึ่งเลื่อนไปคนละหน้ากันได้ และเป็นที่มาของคำถามว่าตอนนี้กำลังแก้หน้าไหนอยู่
//
// Scene เป็น null แปลว่า "ทุกหน้า" ซึ่งไม่มี layout ของตัวเองให้แก้
public sealed class DesignPage : ObservableObject
{
    public DesignPage(string key, string labelKey, string? scene, bool typeSizes, bool teamList, string[] shared)
    {
        Key = key;
        LabelKey = labelKey;
        Scene = scene;
        HasTypeSizes = typeSizes;
        HasTeamList = teamList;
        Shared = shared;
    }

    public string Key { get; }
    public string LabelKey { get; }
    public string? Scene { get; }
    public bool HasTypeSizes { get; }
    public bool HasTeamList { get; }
    public string[] Shared { get; }

    public string Label => Loc.T(LabelKey);
    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// ฟอนต์หนึ่งตัวในรายการที่เลือกได้ ค่าว่างคือ "ตามเดิม" ซึ่งคือ Kanit ที่แถมมากับแอพ
//
// HasThai มาจากการเปิดตาราง glyph ของฟอนต์แล้วถามหาอักขระไทยตัวแรก (ก ไก่ U+0E01)
// ฟอนต์ลาตินส่วนใหญ่ไม่มี ชื่อทีมภาษาไทยจะตกไปที่ Kanit เอง ซึ่งไม่เสียหาย
// แต่ผู้ใช้ควรรู้ก่อนเลือก ว่าหน้านั้นจะมีสองฟอนต์ปนกัน
public sealed class FontChoice : ObservableObject
{
    public FontChoice(string family, bool hasThai)
    {
        Family = family;
        HasThai = hasThai;
    }

    // A font imported into the app. Its Family is the "nzf-<id>" name the overlay turns into
    // an @font-face (overlay-fonts.js); people see the name read from inside the file instead.
    public FontChoice(ImportedFont font)
    {
        Family = font.Family;
        HasThai = font.Thai != false;
        Imported = font;
    }

    public string Family { get; }
    public bool HasThai { get; }
    public ImportedFont? Imported { get; }

    // The name alone, for "All pages: <name>" under a role that follows the shared choice.
    public string DisplayName => Family.Length == 0 ? Loc.T("Fonts.Default") : Imported?.Name ?? Family;

    public string Label => Family.Length == 0
        ? Loc.T("Fonts.Default")
        : Imported is { } f
            ? f.Name + "   · " + Loc.T("Fonts.ImportedTag") + (HasThai ? "" : "   " + Loc.T("Fonts.NoThai"))
            : HasThai ? Family : Family + "   " + Loc.T("Fonts.NoThai");

    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// หน้าที่จะตั้งฟอนต์ให้ "" = ทุกหน้า ที่เหลือคือชื่อฉากเดียวกับ data-layout-scene
public sealed class FontScope : ObservableObject
{
    public FontScope(string key, string labelKey)
    {
        Key = key;
        LabelKey = labelKey;
    }

    public string Key { get; }
    public string LabelKey { get; }
    public string Label => Loc.T(LabelKey);
    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// หนึ่งบทบาทของข้อความ พร้อมฟอนต์ที่เลือกไว้สำหรับหน้าที่กำลังดูอยู่
public sealed class FontRoleRow : ObservableObject
{
    private readonly DesignViewModel _owner;
    private readonly string _labelKey;
    private FontChoice _choice;

    public FontRoleRow(DesignViewModel owner, string role, string labelKey, FontChoice fallback)
    {
        _owner = owner;
        _labelKey = labelKey;
        Role = role;
        _choice = fallback;
    }

    public string Role { get; }
    public string Label => Loc.T(_labelKey);

    // รายการฟอนต์แขวนไว้ที่แถวเอง ไม่ให้ XAML ต้องไต่ขึ้นไปหา DataContext ของ UserControl
    // ผูกแบบนั้นพังเงียบๆ ตอนย้ายคอนโทรล แล้วจะเหลือ ComboBox ว่างเปล่าโดยไม่มีใครรู้
    public IReadOnlyList<FontChoice> Options => _owner.FontOptions;

    public FontChoice Choice
    {
        get => _choice;
        set
        {
            if (value is null || !Set(ref _choice, value)) return;
            _owner.PushFont(Role, value.Family);
        }
    }

    // มาจาก state ต้องไม่ยิงกลับไปที่เซิร์ฟเวอร์ ไม่งั้นจะวนกันไปมา
    public void Apply(FontChoice choice)
    {
        if (ReferenceEquals(choice, _choice)) return;
        _choice = choice;
        OnPropertyChanged(nameof(Choice));
    }

    public void RefreshText() => OnPropertyChanged(nameof(Label));

    // The list was rebuilt under the box: say the choice again so the box shows it.
    public void Reselect() => OnPropertyChanged(nameof(Choice));

    // On a single page, a role left blank follows All pages. The box can only say "Default",
    // so this says what the page really shows, e.g. "All pages: Impact". Empty otherwise.
    private string _inherited = "";
    public string Inherited => _inherited;
    public bool HasInherited => _inherited.Length > 0;
    public void SetInherited(string text)
    {
        if (text == _inherited) return;
        _inherited = text;
        OnPropertyChanged(nameof(Inherited));
        OnPropertyChanged(nameof(HasInherited));
    }
}

// One imported font in the Design screen's library, with its Delete button.
public sealed class ImportedFontRow
{
    public ImportedFontRow(ImportedFont font, Func<ImportedFont, Task> delete)
    {
        Font = font;
        DeleteCommand = new AsyncRelayCommand(() => delete(font));
    }

    public ImportedFont Font { get; }
    public string Name => Font.Name;
    public string Info
    {
        get
        {
            var type = Path.GetExtension(Font.File).TrimStart('.').ToUpperInvariant();
            var size = Font.Bytes >= 1024 * 1024 ? $"{Font.Bytes / 1048576.0:0.0} MB" : $"{Math.Max(1, Font.Bytes / 1024)} KB";
            return Font.Thai == false ? $"{type} · {size} · {Loc.T("Fonts.NoThai")}" : $"{type} · {size}";
        }
    }
    public ICommand DeleteCommand { get; }
}

// ตัวเลือกจำนวนคอลัมน์ของหน้ารายชื่อทีม 0 = Auto ซึ่งมีคำแปล ที่เหลือแสดงเป็นตัวเลขตรงๆ
public sealed class ColumnChoice : ObservableObject
{
    public ColumnChoice(int value) => Value = value;

    public int Value { get; }
    public string Label => Value == 0 ? Loc.T("TeamList.ColumnsAuto") : Value.ToString();
    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

public sealed class ThemeNumberRow : ObservableObject
{
    private readonly DesignViewModel _owner;
    private double _value;

    public ThemeNumberRow(DesignViewModel owner, string key, string labelKey, double min, double max, double fallback)
    {
        _owner = owner;
        Key = key;
        LabelKey = labelKey;
        Min = min;
        Max = max;
        Default = fallback;
        _value = fallback;
    }

    public string Key { get; }
    public string LabelKey { get; }
    public double Min { get; }
    public double Max { get; }
    public double Default { get; }
    public string Label => Loc.T(LabelKey);
    public string ValueText => $"{Math.Round(_value)}px";
    public bool IsChanged => Math.Abs(_value - Default) > 0.5;

    public double Value
    {
        get => _value;
        set
        {
            if (!Set(ref _value, value)) return;
            OnPropertyChanged(nameof(ValueText));
            OnPropertyChanged(nameof(IsChanged));
            _owner.PushTheme(Key, (int)Math.Round(value));
        }
    }

    public void Apply(double value)
    {
        if (Math.Abs(value - _value) < 0.5) return;
        _value = value;
        foreach (var name in new[] { nameof(Value), nameof(ValueText), nameof(IsChanged) }) OnPropertyChanged(name);
    }

    public void RefreshText() => OnPropertyChanged(nameof(Label));
}

// How the overlay looks: the background images it wears, and the colours and sizes of
// everything drawn on top. v2's /design, rebuilt.
public sealed class DesignViewModel : ObservableObject, IClosablePage
{
    private readonly AppServices _s;
    private readonly Debouncer _themeSend = new(120);
    private readonly Debouncer _perSetSend = new(250);
    private int _perSet = 32;
    private string _perSetText = "32";
    private readonly Debouncer _speedSend = new(250);
    private int _scrollSpeed = 40;
    private string _scrollSpeedText = "40";
    private bool _scrollStyle;
    private bool _autoText = true;
    private ColumnChoice _columns = null!;
    private readonly Dictionary<string, object> _pendingTheme = new();
    private bool _skinEnabled;
    private bool _showPanels = true;
    private bool _applying;

    public DesignViewModel(AppServices services)
    {
        _s = services;

        // Same six slots the Design page offered in v2, in the same order.
        Slots =
        [
            new(this, "overlayBottom1080", "overlay-bottom-1080", "Overlay", "Banner", 1920, 430, "Design.NoteBanner"),
            new(this, "resultTop1080", "result-top-1080", "Result", "Top", 1920, 540, "Design.NoteTop"),
            new(this, "resultBottom1080", "result-bottom-1080", "Result", "Bottom", 1920, 540, "Design.NoteBottom"),
            new(this, "overlayBottom1440", "overlay-bottom-1440", "Overlay", "Banner", 2560, 573, "Design.NoteBanner"),
            new(this, "resultTop1440", "result-top-1440", "Result", "Top", 2560, 720, "Design.NoteTop"),
            new(this, "resultBottom1440", "result-bottom-1440", "Result", "Bottom", 2560, 720, "Design.NoteBottom")
        ];

        Colors =
        [
            new(this, "blue", "Design.Blue", "#38bdf8"),
            new(this, "red", "Design.Red", "#f87171"),
            new(this, "text", "Design.Text", "#ffffff"),
            new(this, "accent", "Design.Accent", "#f59e0b"),
            new(this, "label", "Design.Label", "#c0c0c0")
        ];

        // แยกออกมาอยู่ในหมวด Team list ของตัวเอง (ผู้ใช้ขอ 2026-09-29)
        // ยังเป็นสีของธีมชุดเดียวกัน แค่คนละที่บนหน้าจอ
        TeamListColors =
        [
            new(this, "teamCard", "Design.TeamCard", "#3b82f6"),
            new(this, "teamCardBg", "Design.TeamCardBg", "#111220")
        ];

        Numbers =
        [
            new(this, "typeTournament", "Design.TypeTournament", 10, 48, 18),
            new(this, "typeTitle", "Design.TypeTitle", 10, 60, 24),
            new(this, "typeScore", "Design.TypeScore", 12, 96, 42),
            new(this, "typeTimer", "Design.TypeTimer", 12, 96, 40),
            new(this, "typePlayer", "Design.TypePlayer", 10, 48, 22),
            new(this, "typeCaption", "Design.TypeCaption", 8, 40, 14),
            new(this, "logoSize", "Design.LogoSize", 40, 260, 138),
            new(this, "logoInset", "Design.LogoInset", -40, 200, 10)
        ];

        TeamListNumbers =
        [
            new(this, "teamCardRadius", "TeamList.Radius", 0, 40, 12)
        ];
        _columns = ColumnChoices[0];
        _fontScope = FontScopes[0];
        _designPage = DesignPages.FirstOrDefault(p => p.Key == services.Settings.DesignPage) ?? DesignPages[0];

        foreach (var font in SystemFonts) FontOptions.Add(font);
        ImportFontCommand = new AsyncRelayCommand(ImportFontAsync);
        services.ConnectionChanged += up => { if (up) _ = SafeLoadImportedFontsAsync(); };
        // A restore can bring fonts back, and another window can import or delete one.
        services.DataChanged += c => { if (c.Topic == "fonts") _ = SafeLoadImportedFontsAsync(); };
        _ = SafeLoadImportedFontsAsync();

        FontRoles =
        [
            new(this, "heading", "Fonts.Role.Heading", SystemFonts[0]),
            new(this, "name", "Fonts.Role.Name", SystemFonts[0]),
            new(this, "number", "Fonts.Role.Number", SystemFonts[0]),
            new(this, "body", "Fonts.Role.Body", SystemFonts[0])
        ];

        ResetThemeCommand = new RelayCommand(() =>
        {
            _s.Socket?.EmitAsync("resetTheme");
            Toasts.Info(Loc.T("Design.ThemeReset"));
        });
        OpenPreviewCommand = new RelayCommand(() => Browser.Open(_s.Url(Is1440 ? "/overlay-1440" : "/overlay")));

        // Same order as the OBS sources list. The team card has one layout for both sides.
        LayoutScenes =
        [
            new("draft", "/overlay", "Layout.Scene.Draft"),
            new("result", "/result", "Layout.Scene.Result"),
            new("prev", "/overlay-prev", "Layout.Scene.Prev"),
            new("standings", "/overlay-standings", "Layout.Scene.Standings"),
            new("matchup", "/overlay-matchup", "Layout.Scene.Matchup"),
            new("team-drafts", "/overlay-team-drafts", "Layout.Scene.TeamDrafts"),
            new("team-card", "/overlay-team-card?side=blue", "Layout.Scene.TeamCard"),
            new("teams", "/overlay-teams", "Layout.Scene.Teams"),
            new("analytics", "/overlay-analytics", "Layout.Scene.Analytics")
        ];
        _layoutScene = LayoutScenes[0];
        // The field is set directly here, so the setter that keeps the layout editor and the
        // font scope pointing at the same page never runs. Restoring a remembered page would
        // otherwise open on "Team list" while the layout editor still edited the draft overlay.
        if (_designPage.Scene is { } startScene)
        {
            _layoutScene = LayoutScenes.FirstOrDefault(s => s.Key == startScene) ?? _layoutScene;
            _fontScope = FontScopes.FirstOrDefault(s => s.Key == startScene) ?? _fontScope;
        }

        // The editor is the overlay itself with ?edit=1 (backend/public/js/overlay-layout.js):
        // dragging the real page is the only way to see exactly what OBS will show.
        EditLayoutCommand = new RelayCommand(() =>
        {
            var route = LayoutScene.Key == "draft" && Is1440 ? "/overlay-1440" : LayoutScene.Route;
            Browser.Open(_s.Url(route + (route.Contains('?') ? "&" : "?") + "edit=1&lang=" + Loc.Instance.Language));
        });
        ResetLayoutCommand = new RelayCommand(() =>
        {
            var scene = LayoutScene;
            if (!Dialogs.Confirm(Loc.F("Layout.ResetTitle", Loc.T("Layout.Scene." + SceneLabelKey(scene))),
                    [Loc.T("Layout.ResetBody")], Loc.T("Layout.Reset"), danger: true)) return;
            _s.Socket?.EmitAsync("resetLayout", new { scene = scene.Key });
            Toasts.Info(Loc.T("Layout.WasReset"));
        }, () => LayoutScene.Moved > 0);

        PerSetDownCommand = new RelayCommand(() => SetPerSet(_perSet - 1), () => _perSet > PerSetMin);
        PerSetUpCommand = new RelayCommand(() => SetPerSet(_perSet + 1), () => _perSet < PerSetMax);
        // Five at a time: the useful range is 10-200, and one pixel per second per click
        // would take the operator forty clicks to cross it.
        SpeedDownCommand = new RelayCommand(() => SetScrollSpeed(_scrollSpeed - 5), () => _scrollSpeed > SpeedMin);
        SpeedUpCommand = new RelayCommand(() => SetScrollSpeed(_scrollSpeed + 5), () => _scrollSpeed < SpeedMax);

        services.StateUpdated += OnState;
        Loc.Instance.Changed += OnLanguageChanged;
        if (services.LastState is not null) OnState(services.LastState);
    }

    public IReadOnlyList<SkinSlotRow> Slots { get; }
    public IReadOnlyList<ThemeColorRow> Colors { get; }
    public IReadOnlyList<ThemeColorRow> TeamListColors { get; }
    public IReadOnlyList<ThemeNumberRow> TeamListNumbers { get; }
    private IEnumerable<ThemeNumberRow> AllNumbers => Numbers.Concat(TeamListNumbers);
    // ทั้งสองรายการเป็นสีของธีมเหมือนกัน ทุกที่ที่วนทั้งชุดต้องใช้ตัวนี้ ไม่ใช่ Colors เฉยๆ
    private IEnumerable<ThemeColorRow> AllColors => Colors.Concat(TeamListColors);
    public IReadOnlyList<ThemeNumberRow> Numbers { get; }
    public ICommand ResetThemeCommand { get; }
    public ICommand OpenPreviewCommand { get; }
    public ICommand EditLayoutCommand { get; }
    public ICommand ResetLayoutCommand { get; }

    // Teams per set on the Team list overlay (state.teamListPerSet). Sent a moment after the
    // last change, so holding + does not re-split the overlay on every step.
    private const int PerSetMin = 4;
    private const int PerSetMax = 64;
    public bool PerSetEditing { get; set; }
    public ICommand PerSetDownCommand { get; }
    public ICommand PerSetUpCommand { get; }

    // Text rather than int, so a half-typed or empty box is not a binding error; it is
    // read on Enter or when the box loses focus, and anything unreadable puts back the value.
    public string PerSetText
    {
        get => _perSetText;
        set
        {
            if (!Set(ref _perSetText, value)) return;
            if (int.TryParse(value, out var n)) SetPerSet(n, fromText: true);
        }
    }

    public void CommitPerSetText() => PerSetText = _perSet.ToString();

    private void SetPerSet(int value, bool fromText = false)
    {
        var clamped = Math.Clamp(value, PerSetMin, PerSetMax);
        if (!fromText || clamped == value)
        {
            _perSetText = clamped.ToString();
            OnPropertyChanged(nameof(PerSetText));
        }
        if (clamped == _perSet) return;
        _perSet = clamped;
        CommandManager.InvalidateRequerySuggested();
        if (_applying) return;
        _perSetSend.Run(() => _s.Socket?.EmitAsync("updateTeamListPerSet", new { perSet = _perSet }));
    }

    // Team list style (state.teamListStyle). Two radio buttons, one bool each: setting
    // either one has to raise both, or the button just turned off still looks selected.
    public bool StyleIsSets
    {
        get => !_scrollStyle;
        set { if (value) SetStyle(false); }
    }

    public bool StyleIsScroll
    {
        get => _scrollStyle;
        set { if (value) SetStyle(true); }
    }

    private void SetStyle(bool scroll)
    {
        if (_scrollStyle == scroll) return;
        _scrollStyle = scroll;
        OnPropertyChanged(nameof(StyleIsSets));
        OnPropertyChanged(nameof(StyleIsScroll));
        if (_applying) return;
        _s.Socket?.EmitAsync("updateTeamListStyle", new { style = scroll ? "scroll" : "sets" });
    }

    // --- The Design screen is organised by page -------------------------------------
    //
    // Which graphics each shared colour actually paints, read out of the stylesheets rather
    // than guessed: a colour shown on a page has to say truthfully what else it moves.
    private static readonly Dictionary<string, string[]> ColourPages = new()
    {
        ["blue"] = ["draft", "matchup", "prev", "team-card", "team-drafts"],
        ["red"] = ["draft", "matchup", "prev", "team-card", "team-drafts"],
        ["accent"] = ["standings", "matchup", "prev", "team-card", "team-drafts"],
        ["text"] = ["draft", "standings", "matchup", "prev", "team-card", "team-drafts"],
        ["label"] = ["draft", "standings", "matchup", "prev", "team-card", "team-drafts"]
    };

    public IReadOnlyList<DesignPage> DesignPages { get; } =
    [
        new("all", "Design.Page.All", null, false, false, ["blue", "red", "accent", "text", "label"]),
        new("draft", "Fonts.Scene.Draft", "draft", true, false, ["blue", "red", "text", "label"]),
        new("teams", "Fonts.Scene.Teams", "teams", false, true, []),
        new("standings", "Fonts.Scene.Standings", "standings", false, false, ["accent", "text", "label"]),
        new("result", "Fonts.Scene.Result", "result", false, false, []),
        new("analytics", "Fonts.Scene.Analytics", "analytics", false, false, []),
        new("matchup", "Fonts.Scene.Matchup", "matchup", false, false, ["blue", "red", "accent", "text", "label"]),
        new("prev", "Fonts.Scene.Prev", "prev", false, false, ["blue", "red", "accent", "text", "label"]),
        new("team-card", "Fonts.Scene.TeamCard", "team-card", false, false, ["blue", "red", "accent", "text", "label"]),
        new("team-drafts", "Fonts.Scene.TeamDrafts", "team-drafts", false, false, ["blue", "red", "accent", "text", "label"])
    ];

    private DesignPage _designPage = null!;
    public DesignPage DesignPage
    {
        get => _designPage;
        set
        {
            if (value is null || !Set(ref _designPage, value)) return;
            _s.Settings.DesignPage = value.Key;
            _s.Settings.Save();

            // The one picker drives the layout editor and the font scope underneath.
            if (value.Scene is { } scene)
            {
                var row = LayoutScenes.FirstOrDefault(s => s.Key == scene);
                if (row is not null) _layoutScene = row;
            }
            var scope = FontScopes.FirstOrDefault(s => s.Key == (value.Scene ?? "all"));
            if (scope is not null) _fontScope = scope;
            ApplyFonts();

            foreach (var name in new[]
            {
                nameof(LayoutScene), nameof(FontScope), nameof(IsAllPages), nameof(ShowLayout),
                nameof(ShowTypeSizes), nameof(ShowTeamList), nameof(PageColors),
                nameof(ShowPageColors), nameof(SharedWarning), nameof(LayoutStatus),
                nameof(PageSlots), nameof(ShowSlots)
            }) OnPropertyChanged(name);
        }
    }

    // Only /overlay (+1440) and /result declare data-skin-slots, so only those two pages
    // have background images to set. The slot keys carry the page in their prefix.
    public IReadOnlyList<SkinSlotRow> PageSlots => _designPage.Key switch
    {
        "draft" => Slots.Where(s => s.Key.StartsWith("overlay")).ToList(),
        "result" => Slots.Where(s => s.Key.StartsWith("result")).ToList(),
        _ => []
    };

    public bool ShowSlots => PageSlots.Count > 0;

    public bool IsAllPages => _designPage.Scene is null;
    public bool ShowLayout => _designPage.Scene is not null;
    public bool ShowTypeSizes => _designPage.HasTypeSizes;
    public bool ShowTeamList => _designPage.HasTeamList;

    public IReadOnlyList<ThemeColorRow> PageColors =>
        Colors.Where(c => _designPage.Shared.Contains(c.Key)).ToList();

    // On "All pages" they are the point of the screen, so the tick does not hide them there.
    public bool ShowPageColors => PageColors.Count > 0 && (IsAllPages || ShowSharedColours);

    public bool ShowSharedColours
    {
        get => _s.Settings.ShowSharedColours;
        set
        {
            if (_s.Settings.ShowSharedColours == value) return;
            _s.Settings.ShowSharedColours = value;
            _s.Settings.Save();
            OnPropertyChanged();
            OnPropertyChanged(nameof(ShowPageColors));
        }
    }

    public string SharedWarning
    {
        get
        {
            if (IsAllPages) return Loc.T("Design.SharedAll");
            var others = _designPage.Shared
                .SelectMany(key => ColourPages.TryGetValue(key, out var pages) ? pages : [])
                .Distinct()
                .Where(key => key != _designPage.Key)
                .Select(key => DesignPages.FirstOrDefault(p => p.Key == key)?.Label ?? key)
                .OrderBy(label => label)
                .ToArray();
            return others.Length == 0 ? "" : Loc.F("Design.SharedWarning", string.Join(", ", others));
        }
    }

    // Fonts (state.fonts). Chosen per text role, for all pages at once or for one page.
    //
    // The list is the fonts installed on this machine, because OBS renders the overlay here.
    // Families the server would rewrite are left out rather than offered and then mangled:
    // sanitizeFontFamily keeps only letters, digits, spaces, hyphens and underscores, so the
    // vertical-writing duplicates Windows lists with a leading '@' would arrive as something
    // else entirely.
    public IReadOnlyList<FontChoice> SystemFonts { get; } = BuildFontList();
    public IReadOnlyList<FontScope> FontScopes { get; } =
    [
        new("all", "Fonts.AllPages"),
        new("draft", "Fonts.Scene.Draft"),
        new("teams", "Fonts.Scene.Teams"),
        new("standings", "Fonts.Scene.Standings"),
        new("result", "Fonts.Scene.Result"),
        new("analytics", "Fonts.Scene.Analytics"),
        new("matchup", "Fonts.Scene.Matchup"),
        new("prev", "Fonts.Scene.Prev"),
        new("team-card", "Fonts.Scene.TeamCard"),
        new("team-drafts", "Fonts.Scene.TeamDrafts")
    ];

    public IReadOnlyList<FontRoleRow> FontRoles { get; }

    // What every role box offers: Default, then the imported fonts, then the installed ones.
    // Imported first because someone who imported a font almost always came to pick it.
    public ObservableCollection<FontChoice> FontOptions { get; } = [];

    // Font files imported into the app (backend: /api/fonts). Saved in Nuzka's media folder,
    // so they need no installing on this PC and travel with the app's data, not with Windows.
    public ObservableCollection<ImportedFontRow> ImportedFonts { get; } = [];
    public bool HasImportedFonts => ImportedFonts.Count > 0;
    public ICommand ImportFontCommand { get; }

    private const long FontMaxBytes = 20 * 1024 * 1024;   // backend FONT_MAX_BYTES

    private async Task SafeLoadImportedFontsAsync()
    {
        try { await LoadImportedFontsAsync(); }
        catch { /* not connected yet: ConnectionChanged loads it when the server is there */ }
    }

    private async Task LoadImportedFontsAsync()
    {
        if (_s.Api is null) return;
        var list = await _s.Api.GetAsync<ImportedFontList>("/api/fonts");

        ImportedFonts.Clear();
        foreach (var font in list.Fonts) ImportedFonts.Add(new ImportedFontRow(font, DeleteFontAsync));
        OnPropertyChanged(nameof(HasImportedFonts));

        // Rebuilt in place so every box keeps the same list object. Clearing it makes each box
        // drop its selection (and send null, which the rows ignore); ApplyFonts then picks the
        // right entry again, and Reselect makes a box whose choice did not change show it.
        var was = _applying;
        _applying = true;
        try
        {
            FontOptions.Clear();
            FontOptions.Add(SystemFonts[0]);
            foreach (var font in list.Fonts) FontOptions.Add(new FontChoice(font));
            foreach (var font in SystemFonts.Skip(1)) FontOptions.Add(font);
        }
        finally
        {
            _applying = was;
        }
        ApplyFonts();
        foreach (var row in FontRoles) row.Reselect();
    }

    private async Task ImportFontAsync()
    {
        var path = Dialogs.PickOpen($"{Loc.T("Fonts.FileFilter")} (*.ttf;*.otf;*.woff;*.woff2)|*.ttf;*.otf;*.woff;*.woff2");
        if (path is null || _s.Api is null) return;
        if (new FileInfo(path).Length > FontMaxBytes)
        {
            Toasts.Error(Loc.T("Fonts.TooBig"));
            return;
        }

        var (name, thai) = ReadFontInfo(path);
        var bytes = await File.ReadAllBytesAsync(path);
        var query = "/api/fonts?name=" + Uri.EscapeDataString(name) + (thai is { } t ? (t ? "&thai=1" : "&thai=0") : "");
        await _s.Api.PostBytesAsync<ImportedFontReply>(query, bytes, "application/octet-stream");
        Toasts.Info(Loc.F("Fonts.ImportedToast", name));
        await LoadImportedFontsAsync();
    }

    // The name people know the font by, and whether it has Thai letters, read from the file
    // itself. WPF opens TTF and OTF; WOFF and WOFF2 are web-only, so those keep their file
    // name and an unknown Thai answer rather than a guess.
    private static (string Name, bool? Thai) ReadFontInfo(string path)
    {
        var fallback = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is not (".ttf" or ".otf")) return (fallback, null);
        try
        {
            var glyphs = new GlyphTypeface(new Uri(path));
            var en = System.Globalization.CultureInfo.GetCultureInfo("en-US");
            var family = glyphs.FamilyNames.TryGetValue(en, out var f) ? f : glyphs.FamilyNames.Values.FirstOrDefault();
            var face = glyphs.FaceNames.TryGetValue(en, out var s) ? s : glyphs.FaceNames.Values.FirstOrDefault();
            var name = string.IsNullOrWhiteSpace(family) ? fallback
                : string.IsNullOrWhiteSpace(face) || face is "Regular" or "Normal" ? family : family + " " + face;
            return (name, glyphs.CharacterToGlyphMap.ContainsKey(0x0E01));   // ก
        }
        catch
        {
            return (fallback, null);
        }
    }

    private async Task DeleteFontAsync(ImportedFont font)
    {
        if (_s.Api is null) return;
        if (!Dialogs.Confirm(Loc.F("Fonts.DeleteTitle", font.Name), [Loc.T("Fonts.DeleteBody")], Loc.T("Fonts.Delete"), danger: true)) return;
        await _s.Api.DeleteAsync<OkReply>("/api/fonts/" + Uri.EscapeDataString(font.Id));
        Toasts.Info(Loc.T("Fonts.Deleted"));
        await LoadImportedFontsAsync();
    }

    private FontScope _fontScope = null!;
    public FontScope FontScope
    {
        get => _fontScope;
        set
        {
            if (value is null || !Set(ref _fontScope, value)) return;
            ApplyFonts();   // the boxes now describe a different page
        }
    }

    private static IReadOnlyList<FontChoice> BuildFontList()
    {
        var list = new List<FontChoice> { new("", true) };
        var seen = new HashSet<string>();
        foreach (var family in System.Windows.Media.Fonts.SystemFontFamilies)
        {
            var name = family.Source ?? "";
            var clean = new string(name.Where(c => char.IsLetterOrDigit(c) || c == ' ' || c == '-' || c == '_').ToArray()).Trim();
            if (clean.Length == 0 || clean != name || !seen.Add(clean)) continue;

            var hasThai = false;
            try
            {
                foreach (var typeface in family.GetTypefaces())
                {
                    if (!typeface.TryGetGlyphTypeface(out var glyphs)) continue;
                    hasThai = glyphs.CharacterToGlyphMap.ContainsKey(0x0E01);   // ก
                    break;
                }
            }
            catch
            {
                // A font the system lists but cannot open is not worth failing the screen over.
            }

            list.Add(new FontChoice(clean, hasThai));
        }
        return list;
    }

    internal void PushFont(string role, string family)
    {
        if (_applying) return;
        _s.Socket?.EmitAsync("updateFont", new { scene = _fontScope.Key, role, family });
    }

    // อ่านค่าจาก state ที่เก็บไว้ล่าสุด มาแสดงตามหน้าที่กำลังเลือกอยู่
    private JsonObject? _fontsNode;

    private void ApplyFonts()
    {
        var was = _applying;
        _applying = true;
        try
        {
            var all = _fontsNode?["all"] as JsonObject;
            var pages = _fontsNode?["pages"] as JsonObject;
            var page = _fontScope.Key == "all" ? null : pages?[_fontScope.Key] as JsonObject;

            foreach (var row in FontRoles)
            {
                // A page shows its own override, or blank meaning "same as all pages".
                var family = _fontScope.Key == "all"
                    ? J.Str(all?[row.Role]) ?? ""
                    : J.Str(page?[row.Role]) ?? "";
                row.Apply(FontOptions.FirstOrDefault(f => f.Family == family) ?? SystemFonts[0]);

                var shared = J.Str(all?[row.Role]) ?? "";
                row.SetInherited(_fontScope.Key == "all" || family.Length > 0 ? ""
                    : Loc.F("Fonts.Inherited", (FontOptions.FirstOrDefault(f => f.Family == shared) ?? SystemFonts[0]).DisplayName));
            }
        }
        finally
        {
            _applying = was;
        }
    }

    // Dark text on a light card (state.teamListAutoText). On by default and a no-op while
    // the card background is dark, so it changes nothing for anyone who never touches it.
    // จำนวนคอลัมน์: Auto หรือ 1..6 (ผู้ใช้ขอให้เลือกหนึ่งคอลัมน์ได้ 2026-09-29)
    public IReadOnlyList<ColumnChoice> ColumnChoices { get; } =
    [
        new(0), new(1), new(2), new(3), new(4), new(5), new(6)
    ];

    public ColumnChoice Columns
    {
        get => _columns;
        set
        {
            if (value is null || !Set(ref _columns, value) || _applying) return;
            _s.Socket?.EmitAsync("updateTeamListColumns", new { columns = value.Value });
        }
    }

    public bool AutoText
    {
        get => _autoText;
        set
        {
            if (!Set(ref _autoText, value) || _applying) return;
            _s.Socket?.EmitAsync("updateTeamListAutoText", new { autoText = value });
        }
    }

    // Scroll speed in pixels per second (state.teamListScrollSpeed). Same shape as the
    // per-set box: text rather than int so a half-typed value is not a binding error.
    private const int SpeedMin = 10;
    private const int SpeedMax = 200;
    public bool SpeedEditing { get; set; }
    public ICommand SpeedDownCommand { get; }
    public ICommand SpeedUpCommand { get; }

    public string ScrollSpeedText
    {
        get => _scrollSpeedText;
        set
        {
            if (!Set(ref _scrollSpeedText, value)) return;
            if (int.TryParse(value, out var n)) SetScrollSpeed(n, fromText: true);
        }
    }

    public void CommitScrollSpeedText() => ScrollSpeedText = _scrollSpeed.ToString();

    private void SetScrollSpeed(int value, bool fromText = false)
    {
        var clamped = Math.Clamp(value, SpeedMin, SpeedMax);
        if (!fromText || clamped == value)
        {
            _scrollSpeedText = clamped.ToString();
            OnPropertyChanged(nameof(ScrollSpeedText));
        }
        if (clamped == _scrollSpeed) return;
        _scrollSpeed = clamped;
        CommandManager.InvalidateRequerySuggested();
        if (_applying) return;
        _speedSend.Run(() => _s.Socket?.EmitAsync("updateTeamListScrollSpeed", new { speed = _scrollSpeed }));
    }

    public IReadOnlyList<LayoutSceneRow> LayoutScenes { get; }
    private LayoutSceneRow _layoutScene;
    public LayoutSceneRow LayoutScene
    {
        get => _layoutScene;
        set
        {
            if (value is null || !Set(ref _layoutScene, value)) return;
            OnPropertyChanged(nameof(LayoutStatus));
            CommandManager.InvalidateRequerySuggested();
        }
    }

    private static string SceneLabelKey(LayoutSceneRow scene) => scene.Key switch
    {
        "team-drafts" => "TeamDrafts",
        "team-card" => "TeamCard",
        _ => char.ToUpperInvariant(scene.Key[0]) + scene.Key[1..]
    };

    // How many parts of the chosen overlay have been moved, resized or hidden.
    public string LayoutStatus => LayoutScene.Moved == 0 ? Loc.T("Layout.AsDesigned") : Loc.F("Layout.Moved", LayoutScene.Moved);

    public bool Is1440 { get; private set; }
    public string PreviewSizeText => Is1440 ? "2560 × 1440" : "1920 × 1080";

    public bool SkinEnabled
    {
        get => _skinEnabled;
        set
        {
            if (!Set(ref _skinEnabled, value) || _applying) return;
            _s.Socket?.EmitAsync("updateSkinOptions", new { enabled = value });
        }
    }

    public bool ShowPanels
    {
        get => _showPanels;
        set
        {
            if (!Set(ref _showPanels, value) || _applying) return;
            _s.Socket?.EmitAsync("updateSkinOptions", new { showPanels = value });
        }
    }

    // Dragging a slider fires constantly; the overlay only needs the value it settles on,
    // plus enough updates on the way to feel live.
    internal void PushTheme(string key, object value)
    {
        if (_applying) return;
        _pendingTheme[key] = value;
        _themeSend.Run(() =>
        {
            var payload = new Dictionary<string, object>(_pendingTheme);
            _pendingTheme.Clear();
            _s.Socket?.EmitAsync("updateTheme", payload);
        });
    }

    internal async Task UploadAsync(SkinSlotRow slot)
    {
        var path = Dialogs.PickImage();
        if (path is null) return;

        var type = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => null
        };
        if (type is null)
        {
            Toasts.Error(Loc.T("Team.LogoType"));
            return;
        }
        if (new FileInfo(path).Length > 8 * 1024 * 1024)
        {
            Toasts.Error(Loc.T("Design.TooBig"));
            return;
        }

        var bytes = await File.ReadAllBytesAsync(path);
        await _s.Api.PostBytesAsync<OkReply>($"/api/skin/{slot.Key}", bytes, type);
        Toasts.Info(Loc.T("Design.Uploaded"));
    }

    internal async Task ClearAsync(SkinSlotRow slot)
    {
        await _s.Api.DeleteAsync<OkReply>($"/api/skin/{slot.Key}");
        Toasts.Info(Loc.T("Design.Cleared"));
    }

    private void OnState(JsonNode node)
    {
        _applying = true;
        try
        {
            var skin = node["skin"];
            SkinEnabled = J.Bool(skin?["enabled"]) == true;
            ShowPanels = J.Bool(skin?["showPanels"]) != false;

            foreach (var slot in Slots) _ = slot.ApplyAsync(J.Int(skin?["slots"]?[slot.Key]), _s);

            // Not while someone is typing in the box: the echo of their own change would
            // overwrite what they are still typing.
            if (J.Int(node["teamListPerSet"], 32) is var perSet && perSet != _perSet && !PerSetEditing) SetPerSet(perSet);
            SetStyle(J.Str(node["teamListStyle"]) == "scroll");
            if (J.Int(node["teamListScrollSpeed"], 40) is var speed && speed != _scrollSpeed && !SpeedEditing) SetScrollSpeed(speed);
            AutoText = J.Bool(node["teamListAutoText"]) != false;
            _fontsNode = node["fonts"] as JsonObject;
            ApplyFonts();
            var cols = J.Int(node["teamListColumns"], 0);
            if (cols != (_columns?.Value ?? -1)) Columns = ColumnChoices.FirstOrDefault(c => c.Value == cols) ?? ColumnChoices[0];

            foreach (var scene in LayoutScenes) scene.Apply((node["layout"]?[scene.Key] as JsonObject)?.Count ?? 0);
            OnPropertyChanged(nameof(LayoutStatus));
            CommandManager.InvalidateRequerySuggested();

            var theme = node["theme"];
            foreach (var row in AllColors)
            {
                if (J.Str(theme?[row.Key]) is { Length: > 0 } hex) row.Apply(hex);
            }
            foreach (var row in AllNumbers) row.Apply(J.Int(theme?[row.Key], (int)row.Default));

            var size = J.Str(node["overlaySize"]) == "1440";
            if (size != Is1440)
            {
                Is1440 = size;
                OnPropertyChanged(nameof(Is1440));
                OnPropertyChanged(nameof(PreviewSizeText));
            }
        }
        finally
        {
            _applying = false;
        }
    }

    private void OnLanguageChanged()
    {
        foreach (var slot in Slots) slot.RefreshText();
        foreach (var row in AllColors) row.RefreshText();
        foreach (var row in AllNumbers) row.RefreshText();
        foreach (var choice in ColumnChoices) choice.RefreshText();
        foreach (var font in FontOptions) font.RefreshText();
        foreach (var scope in FontScopes) scope.RefreshText();
        foreach (var row in FontRoles) row.RefreshText();
        ApplyFonts();   // the "All pages: ..." notes are in the old language
        foreach (var page in DesignPages) page.RefreshText();
        OnPropertyChanged(nameof(SharedWarning));
        foreach (var scene in LayoutScenes) scene.RefreshText();
        OnPropertyChanged(nameof(LayoutStatus));
    }

    public void OnClosed()
    {
        _s.StateUpdated -= OnState;
        Loc.Instance.Changed -= OnLanguageChanged;
    }
}
