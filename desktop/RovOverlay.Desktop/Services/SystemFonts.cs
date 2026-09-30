using RovOverlay.Desktop.Models;

namespace RovOverlay.Desktop.Services;

// The fonts installed on this PC, handed to the backend so the overlay editor can offer them.
//
// The Design screen used to list these itself. Since 2026-09-30 all design happens in the
// editor on the overlay page (backend/public/js/overlay-style-editor.js), and a web page cannot
// ask Windows which fonts are installed, so the app tells the backend on every connect.
//
// Families the server would rewrite are left out rather than sent and then mangled:
// sanitizeFontFamily keeps only letters, digits, spaces, hyphens and underscores, so the
// vertical-writing duplicates Windows lists with a leading '@' would arrive as something else.
public static class SystemFonts
{
    public sealed record Entry(string Family, bool Thai);

    private static IReadOnlyList<Entry>? _cache;

    public static IReadOnlyList<Entry> List() => _cache ??= Scan();

    private static IReadOnlyList<Entry> Scan()
    {
        var list = new List<Entry>();
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
                // A font the system lists but cannot open is not worth failing over.
            }
            list.Add(new Entry(clean, hasThai));
        }
        return list.OrderBy(f => f.Family, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public static async Task SendAsync(ApiClient api)
    {
        try
        {
            var fonts = await Task.Run(List);
            await api.PutAsync<OkReply>("/api/system-fonts", new { fonts = fonts.Select(f => new { family = f.Family, thai = f.Thai }) });
        }
        catch
        {
            // The editor still offers Kanit and imported fonts; the list comes on the next connect.
        }
    }
}
