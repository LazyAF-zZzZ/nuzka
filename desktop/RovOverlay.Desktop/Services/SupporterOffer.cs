namespace RovOverlay.Desktop.Services;

// What the Support screen offers, in one place (docs/PLAN.md §10).
//
// Fill these in when they are decided; an empty value shows as "coming soon" rather than
// as a blank or a made-up number. They ship inside the app, so changing one takes an
// update.
//
// The PromptPay QR is not here: it is a picture, Assets/promptpay-qr.png next to the exe
// (the project copies anything in Assets/). No file means the "QR coming soon" box.
public static class SupporterOffer
{
    // Shown as written, e.g. "฿99".
    public const string MonthlyPrice = "฿159";
    public const string YearlyPrice = "";

    // Where people send their payment slip: a LINE, Facebook or other link the button
    // opens, and the name shown on it, e.g. "LINE: @nuzka".
    public const string ContactUrl = "";
    public const string ContactLabel = "";
}
