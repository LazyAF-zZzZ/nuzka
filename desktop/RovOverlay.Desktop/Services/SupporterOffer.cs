namespace RovOverlay.Desktop.Services;

// What the Support screen offers, in one place (docs/PLAN.md §10).
//
// An empty value shows as "coming soon" rather than as a blank or a made-up number. These
// ship inside the app, so changing one takes an update.
public static class SupporterOffer
{
    // Shown as written, e.g. "฿159". The amounts actually charged are the key shop's
    // PRICE_SATANG, PRICE_QUARTER_SATANG and PRICE_YEAR_SATANG (cloud/wrangler.toml, defaults in
    // cloud/src/worker.js): keep them the same. The shop's plan page shows the live prices and
    // is what "Get a key" opens, so a stale label here cannot make anyone pay the wrong amount.
    public const string MonthlyPrice = "฿159";
    public const string QuarterlyPrice = "฿430";
    public const string YearlyPrice = "฿1,650";

    // The key shop (cloud/, a Cloudflare Worker in front of Stripe), e.g.
    // "https://nuzka-keys.<account>.workers.dev". "Get a key" opens <ShopUrl>/buy?lang=th|en, the shop's page for choosing 1 month, 3 months or 1 year.
    // Empty until it is deployed: the button then says buying opens soon.
    public const string ShopUrl = "https://nuzka-keys.nuzka.workers.dev";
}
