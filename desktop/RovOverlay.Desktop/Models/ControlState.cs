using System.Text.Json.Nodes;
using RovOverlay.Desktop.Core;
using RovOverlay.Desktop.Services;

namespace RovOverlay.Desktop.Models;

// The live overlay state, read out of the loose JSON the server pushes on
// "stateUpdate". Every field tolerates rubbish: this arrives once a second while a
// draft runs, and a bad value must never take the Control Panel down mid-broadcast.
public sealed class ControlState
{
    public const int PickCount = 5;
    public const int BanCount = 4;

    public SideState Blue { get; private init; } = new();
    public SideState Red { get; private init; } = new();
    public string Tournament { get; private init; } = "";
    public string MatchTitle { get; private init; } = "";
    public string Timer { get; private init; } = "";
    public string DraftLabel { get; private init; } = "";
    public int DraftPhaseIndex { get; private init; } = -1;
    public bool DraftRunning { get; private init; }
    public IReadOnlyList<string> ActiveSlots { get; private init; } = [];
    public string OverlaySize { get; private init; } = "1080";
    public bool OverlayVisible { get; private init; } = true;
    public int Round { get; private init; } = 1;
    public int RoundsOnBoard { get; private init; }
    // Teams swap sides every game. On unless the state says otherwise.
    public bool SwapSides { get; private init; } = true;
    // The draft overlay shows each team's tag as a badge on its logo. Off unless the state says on.
    public bool ShowTags { get; private init; }
    public BroadcastState Broadcast { get; private init; } = new();
    public IReadOnlyDictionary<string, double> Sfx { get; private init; } = new Dictionary<string, double>();
    public IReadOnlyDictionary<string, HotkeyBinding> Hotkeys { get; private init; } = new Dictionary<string, HotkeyBinding>();

    // "coming soon" is the draft engine's way of saying nothing is running yet.
    public bool DraftIdle => DraftLabel is "" or "coming soon";

    public static ControlState From(JsonNode node)
    {
        var round = Math.Max(1, J.Int(node["round"], 1));
        var rounds = node["rounds"] as JsonArray;

        return new ControlState
        {
            Blue = SideState.From(node["teamBlue"], "BLUE"),
            Red = SideState.From(node["teamRed"], "RED"),
            Tournament = J.Str(node["matchInfo"]?["tournament"]) ?? "",
            MatchTitle = J.Str(node["matchInfo"]?["title"]) ?? "",
            Timer = J.Str(node["timer"]) ?? "",
            DraftLabel = J.Str(node["draftLabel"]) ?? "",
            DraftPhaseIndex = J.Int(node["draftPhaseIndex"], -1),
            DraftRunning = J.Bool(node["draftRunning"]) == true,
            ActiveSlots = (node["draftActiveSlots"] as JsonArray)?.Select(J.Str).OfType<string>().ToList() ?? [],
            OverlaySize = J.Str(node["overlaySize"]) == "1440" ? "1440" : "1080",
            OverlayVisible = J.Bool(node["overlayVisible"]) != false,
            Round = round,
            RoundsOnBoard = rounds?.Count(r => J.Int(r?["round"], 0) is var n && n > 0 && n < round) ?? 0,
            SwapSides = J.Bool(node["swapSidesEachRound"]) != false,
            ShowTags = J.Bool(node["draftShowTag"]) == true,
            Broadcast = BroadcastState.From(node["broadcast"]),
            Sfx = ReadLevels(node["sfx"]),
            Hotkeys = ReadHotkeys(node["hotkeys"])
        };
    }

    private static Dictionary<string, double> ReadLevels(JsonNode? node)
    {
        var levels = new Dictionary<string, double>();
        foreach (var key in new[] { "pick", "ban", "timer" })
        {
            var value = node?[key] is JsonValue v && v.TryGetValue<double>(out var d) ? d : 1;
            levels[key] = Math.Clamp(value, 0, 1);
        }
        return levels;
    }

    private static Dictionary<string, HotkeyBinding> ReadHotkeys(JsonNode? node)
    {
        var bindings = new Dictionary<string, HotkeyBinding>();
        foreach (var (action, fallback) in HotkeyBinding.Defaults)
            bindings[action] = HotkeyBinding.From(node?[action]) ?? fallback;
        return bindings;
    }
}

// The break scenes, lower third and animated background (server/domain/broadcast.ts).
public sealed class BroadcastState
{
    public string Style { get; private init; } = "aurora";
    public string Palette { get; private init; } = "theme";
    public int Seed { get; private init; } = 1;
    public double Quality { get; private init; } = 0.75;
    // Per-scene overrides ("starting", "brb", "ending", "vs"): only the keys that scene sets itself.
    public IReadOnlyDictionary<string, SceneBackground> SceneBackgrounds { get; private init; } = new Dictionary<string, SceneBackground>();
    // When the countdown reaches zero, as Unix milliseconds. Null = not running.
    public long? CountdownEndsAt { get; private init; }
    public string CountdownLabel { get; private init; } = "";
    // The lower third cards, first one at the bottom of the stack. Always at least one.
    public IReadOnlyList<LowerThirdState> LowerThirds { get; private init; } = [new LowerThirdState(false, "", "", "")];
    public string StartingTitle { get; private init; } = "";
    public string BrbTitle { get; private init; } = "";
    public string BrbSubtitle { get; private init; } = "";
    public string EndingTitle { get; private init; } = "";
    public string EndingSubtitle { get; private init; } = "";

    // The style, colours and quality a scene really uses: its own where set, the shared one otherwise.
    // "all" is the shared background itself.
    public (string Style, string Palette, double Quality) Effective(string scene)
    {
        if (!SceneBackgrounds.TryGetValue(scene, out var own)) return (Style, Palette, Quality);
        return (own.Style ?? Style, own.Palette ?? Palette, own.Quality ?? Quality);
    }

    public bool HasOverride(string scene) => SceneBackgrounds.ContainsKey(scene);

    private static Dictionary<string, SceneBackground> ReadSceneBackgrounds(JsonNode? node)
    {
        var result = new Dictionary<string, SceneBackground>();
        foreach (var scene in new[] { "starting", "brb", "ending", "vs" })
        {
            if (node?[scene] is not JsonObject own) continue;
            result[scene] = new SceneBackground(
                J.Str(own["style"]),
                J.Str(own["palette"]),
                own["quality"] is JsonValue q && q.TryGetValue<double>(out var quality) ? Math.Clamp(quality, 0.25, 1) : null);
        }
        return result;
    }

    // The server keeps 1 to 4 cards. A state written before there were several holds one under "lowerThird".
    private static List<LowerThirdState> ReadLowerThirds(JsonNode? node)
    {
        var cards = new List<LowerThirdState>();
        if (node?["lowerThirds"] is JsonArray list)
        {
            foreach (var item in list.Take(4)) cards.Add(ReadCard(item));
        }
        else if (node?["lowerThird"] is { } legacy)
        {
            cards.Add(ReadCard(legacy));
        }
        if (cards.Count == 0) cards.Add(new LowerThirdState(false, "", "", ""));
        return cards;
    }

    private static LowerThirdState ReadCard(JsonNode? card) => new(
        J.Bool(card?["visible"]) == true,
        J.Str(card?["name"]) ?? "",
        J.Str(card?["title"]) ?? "",
        J.Str(card?["handle"]) ?? "");

    public static BroadcastState From(JsonNode? node)
    {
        var background = node?["background"];
        var countdown = node?["countdown"];
        var lowerThirds = ReadLowerThirds(node);
        var text = node?["text"];
        return new BroadcastState
        {
            Style = J.Str(background?["style"]) is { Length: > 0 } style ? style : "aurora",
            Palette = J.Str(background?["palette"]) is { Length: > 0 } palette ? palette : "theme",
            Seed = J.Int(background?["seed"], 1),
            Quality = background?["quality"] is JsonValue q && q.TryGetValue<double>(out var quality)
                ? Math.Clamp(quality, 0.25, 1) : 0.75,
            SceneBackgrounds = ReadSceneBackgrounds(node?["sceneBackgrounds"]),
            CountdownEndsAt = countdown?["endsAt"] is JsonValue e && e.TryGetValue<long>(out var ends) && ends > 0 ? ends : null,
            CountdownLabel = J.Str(countdown?["label"]) ?? "",
            LowerThirds = lowerThirds,
            StartingTitle = J.Str(text?["startingTitle"]) ?? "",
            BrbTitle = J.Str(text?["brbTitle"]) ?? "",
            BrbSubtitle = J.Str(text?["brbSubtitle"]) ?? "",
            EndingTitle = J.Str(text?["endingTitle"]) ?? "",
            EndingSubtitle = J.Str(text?["endingSubtitle"]) ?? ""
        };
    }
}

// What one scene sets for itself; a null field follows the shared background.
public sealed record LowerThirdState(bool Visible, string Name, string Title, string Handle);

public sealed record SceneBackground(string? Style, string? Palette, double? Quality);

public sealed class SideState
{
    public string Name { get; private init; } = "";
    public string Tag { get; private init; } = "";
    public int Score { get; private init; }
    public long LogoVersion { get; private init; }
    public string LogoExt { get; private init; } = "";
    public string? LogoSource { get; private init; }
    public IReadOnlyList<string> Players { get; private init; } = [];
    public IReadOnlyList<string> Positions { get; private init; } = [];
    public IReadOnlyList<string?> Picks { get; private init; } = [];
    // ช่องพิคที่เลือกไว้แล้วแต่ยังไม่ได้กดยืนยัน overlay ขึ้นภาพแล้วแต่ยังเงียบอยู่
    public IReadOnlyList<bool> PicksPending { get; private init; } = [];
    public IReadOnlyList<string?> Bans { get; private init; } = [];

    public static SideState From(JsonNode? node, string fallbackName) => new()
    {
        Name = J.Str(node?["name"]) is { Length: > 0 } name ? name : fallbackName,
        Tag = J.Str(node?["tag"]) ?? "",
        Score = J.Int(node?["score"]),
        LogoVersion = node?["logo"]?["v"] is JsonValue v && v.TryGetValue<long>(out var version) ? version : 0,
        LogoExt = J.Str(node?["logo"]?["ext"]) ?? "",
        LogoSource = J.Str(node?["logo"]?["src"]),
        Players = Texts(node?["players"], ControlState.PickCount),
        Positions = Texts(node?["positions"], ControlState.PickCount),
        Picks = Heroes(node?["picks"], ControlState.PickCount),
        PicksPending = Flags(node?["picksPending"], ControlState.PickCount),
        Bans = Heroes(node?["bans"], ControlState.BanCount)
    };

    private static List<bool> Flags(JsonNode? node, int count)
    {
        var array = node as JsonArray;
        return Enumerable.Range(0, count)
            .Select(i => J.Bool(array?.ElementAtOrDefault(i)) == true)
            .ToList();
    }

    private static List<string> Texts(JsonNode? node, int count)
    {
        var array = node as JsonArray;
        return Enumerable.Range(0, count).Select(i => J.Str(array?.ElementAtOrDefault(i)) ?? "").ToList();
    }

    private static List<string?> Heroes(JsonNode? node, int count)
    {
        var array = node as JsonArray;
        return Enumerable.Range(0, count)
            .Select(i => J.Str(array?.ElementAtOrDefault(i)) is { Length: > 0 } hero ? hero : null)
            .ToList();
    }
}
