using System.IO;
using System.Text.Json;

namespace RovOverlay.Desktop.Services;

// Desktop-app preferences, plus where v3 keeps the operator's data.
//
// The data lives under %APPDATA%\RovOverlayTool3, deliberately apart from v2's
// %APPDATA%\ROV Overlay Tool. v3 never reads or writes v2's folder on its own; moving
// data across is an explicit import the operator asks for.
//
// It is also apart from the install folder, because the updater replaces the install
// folder wholesale on every update.
public sealed class AppSettings
{
    public const int DefaultPort = 3000;

    public string Language { get; set; } = "th";
    public int Port { get; set; } = DefaultPort;

    // "stable" or "beta". Test versions arrive earlier and break more often, so this is
    // opt-in and lives here rather than being guessed from the version number.
    public string UpdateChannel { get; set; } = "stable";

    // Messages from the maker the operator has already read, so they stay gone.
    public List<string> DismissedNotices { get; set; } = new();

    // Which version of the licence has been agreed to. A number, not a flag, so a
    // changed licence can be shown again instead of being assumed.
    public int AgreedLicence { get; set; }

    // The day (yyyy-MM-dd) the supporter-key reminder was last shown, so it comes at
    // most once a day however often the app restarts.
    public string? SupporterRemindedOn { get; set; }

    // Which sections the operator folded away, by key, so a 128-team roster stays folded
    // the next time the page opens.
    // à¹à¸ªà¸”à¸‡à¸ªà¸µà¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸£à¹ˆà¸§à¸¡à¸à¸±à¸™à¸‹à¹‰à¸³à¹ƒà¸™à¸—à¸¸à¸à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸¡à¸±à¸™ à¸«à¸£à¸·à¸­à¹ƒà¸«à¹‰à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆà¸«à¸™à¹‰à¸² "à¸—à¸¸à¸à¸«à¸™à¹‰à¸²" à¸—à¸µà¹ˆà¹€à¸”à¸µà¸¢à¸§
    // à¹€à¸›à¸´à¸”à¹„à¸§à¹‰à¹€à¸›à¹‡à¸™à¸„à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™: à¸«à¸²à¹€à¸ˆà¸­à¸•à¸£à¸‡à¸—à¸µà¹ˆà¸¡à¸­à¸‡à¸«à¸²à¸ªà¸³à¸„à¸±à¸à¸à¸§à¹ˆà¸²à¸„à¸§à¸²à¸¡à¸ªà¸°à¸­à¸²à¸”à¸‚à¸­à¸‡à¸«à¸™à¹‰à¸²à¸ˆà¸­
    // à¹€à¸›à¹‡à¸™à¸„à¸§à¸²à¸¡à¸Šà¸­à¸šà¸‚à¸­à¸‡à¸„à¸™à¹ƒà¸Šà¹‰à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸™à¸µà¹‰ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸­à¸­à¸à¸­à¸²à¸à¸²à¸¨ à¸ˆà¸¶à¸‡à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆà¸™à¸µà¹ˆ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹ƒà¸™ state
    public bool ShowSharedColours { get; set; } = true;

    // à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸à¹„à¸§à¹‰à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸šà¸™à¸ˆà¸­ Design à¸„à¸™à¸„à¸¸à¸¡à¸‡à¸²à¸™à¸ªà¹ˆà¸§à¸™à¹ƒà¸«à¸à¹ˆà¹à¸•à¹ˆà¸‡à¸à¸£à¸²à¸Ÿà¸´à¸à¹€à¸”à¸´à¸¡à¸‹à¹‰à¸³à¹†
    // à¹€à¸›à¸´à¸”à¹à¸­à¸žà¸¡à¸²à¹à¸¥à¹‰à¸§à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆà¸«à¸™à¹‰à¸²à¹€à¸”à¸´à¸¡à¸ˆà¸¶à¸‡à¸•à¸£à¸‡à¸à¸±à¸šà¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸¡à¸²à¸à¸à¸§à¹ˆà¸²à¹€à¸£à¸´à¹ˆà¸¡à¸—à¸µà¹ˆ "à¸—à¸¸à¸à¸«à¸™à¹‰à¸²" à¸—à¸¸à¸à¸„à¸£à¸±à¹‰à¸‡

    public Dictionary<string, bool> Folds { get; set; } = new();

    public bool IsOpen(string key, bool fallback) => Folds.TryGetValue(key, out var open) ? open : fallback;

    public void SetOpen(string key, bool open)
    {
        Folds[key] = open;
        Save();
    }

    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "RovOverlayTool3");

    public static string DataDir => Path.Combine(Root, "data");
    public static string MediaDir => Path.Combine(Root, "media");
    private static string FilePath => Path.Combine(Root, "settings.json");

    public static AppSettings Load()
    {
        AppSettings settings;
        try
        {
            settings = File.Exists(FilePath)
                ? JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath)) ?? new AppSettings()
                : new AppSettings();
        }
        catch
        {
            // A damaged settings file costs the operator their language choice, nothing more.
            settings = new AppSettings();
        }

        if (settings.Language is not ("th" or "en")) settings.Language = "th";
        if (settings.Port is < 1024 or > 65535) settings.Port = DefaultPort;
        return settings;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Root);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Not being able to remember a preference is not worth interrupting anyone for.
        }
    }
}
