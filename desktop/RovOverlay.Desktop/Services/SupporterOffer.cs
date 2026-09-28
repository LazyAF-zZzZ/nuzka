namespace RovOverlay.Desktop.Services;

// What the Support screen offers, in one place (docs/PLAN.md §10).
//
// An empty value shows as "coming soon" rather than as a blank or a made-up number. These
// ship inside the app, so changing one takes an update.
public static class SupporterOffer
{
    // Shown as written, e.g. "฿159". The amount actually charged is the key shop's
    // PRICE_SATANG (cloud/wrangler.toml): keep the two the same.
    public const string MonthlyPrice = "฿159";
    public const string YearlyPrice = "";

    // The key shop (cloud/, a Cloudflare Worker in front of Stripe), e.g.
    // "https://nuzka-keys.<account>.workers.dev". "Get a key" opens <ShopUrl>/buy?lang=th|en.
    // Empty until it is deployed: the button then says buying opens soon.
    public const string ShopUrl = "";
}
