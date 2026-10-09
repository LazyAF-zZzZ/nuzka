using System.Windows.Input;
using RovOverlay.Desktop.Core;
using RovOverlay.Desktop.Models;
using RovOverlay.Desktop.Services;

namespace RovOverlay.Desktop.ViewModels;

// The supporter key as the operator sees it: who it belongs to, until when, a box to
// paste one and a way to remove it. Settings and the Support screen each hold one, so
// both stay in step through AppServices.SupporterChanged.
public sealed class SupporterPanel : ObservableObject
{
    private readonly AppServices _services;
    private string _keyInput = "";

    public SupporterPanel(AppServices services)
    {
        _services = services;
        UseKeyCommand = new AsyncRelayCommand(UseKeyAsync);
        RemoveKeyCommand = new AsyncRelayCommand(RemoveKeyAsync);
        _services.SupporterChanged += _ => Raise();
        Loc.Instance.Changed += Raise;
    }

    public string KeyInput { get => _keyInput; set => Set(ref _keyInput, value); }

    public ICommand UseKeyCommand { get; }
    public ICommand RemoveKeyCommand { get; }

    public bool IsSupporter => _services.Supporter?.Active == true;

    // A key is saved (working or not), so there is something to remove.
    public bool HasKey => _services.Supporter is { State: not "none" };

    public string Text
    {
        get
        {
            var s = _services.Supporter;
            if (s is null) return Loc.T("Supporter.Offline");
            var name = s.Name ?? "?";
            var date = SupporterDates.Show(s.Expires);
            return s.State switch
            {
                "none" => Loc.T("Supporter.None"),
                "active" when s.DaysLeft is <= 7 => Loc.F("Supporter.ActiveSoon", name, date, s.DaysLeft),
                "active" => Loc.F("Supporter.Active", name, date),
                "expired" => Loc.F("Supporter.Expired", name, date),
                "revoked" => Loc.F("Supporter.Revoked", name),
                _ => Loc.T("Supporter.Broken")
            };
        }
    }

    private void Raise()
    {
        OnPropertyChanged(nameof(IsSupporter));
        OnPropertyChanged(nameof(HasKey));
        OnPropertyChanged(nameof(Text));
    }

    // The server checks the key and says why it will not take one; the reason is shown
    // in the app's language by its code, with the server's English as the fallback.
    private async Task UseKeyAsync()
    {
        if (string.IsNullOrWhiteSpace(KeyInput)) return;
        try
        {
            var status = await _services.Api.PutAsync<SupporterStatus>("/api/supporter", new { key = KeyInput });
            KeyInput = "";
            Toasts.Info(Loc.F("Supporter.Thanks", status.Name));
        }
        catch (ApiException error) when (error.Status == 400)
        {
            var key = $"Supporter.Err.{error.Code}";
            var text = Loc.T(key);
            Toasts.Error(text == key ? error.Message : text);
        }
    }

    private async Task RemoveKeyAsync()
    {
        string[] body = [Loc.T("Supporter.RemoveBody"), Loc.T("Supporter.RemoveBody2")];
        if (!Dialogs.Confirm(Loc.T("Supporter.RemoveTitle"), body, Loc.T("Supporter.Remove"), danger: true)) return;
        await _services.Api.DeleteAsync<SupporterStatus>("/api/supporter");
        Toasts.Info(Loc.T("Supporter.Removed"));
    }
}

// The Support screen: what supporting gets you, what it costs, a button to buy, and the
// key box, so someone can go from "what is this watermark" to a clean overlay on one page.
// Nothing is bought inside the app: "Get a key" opens the key shop (cloud/) in the
// browser, where Stripe takes PromptPay or a card and the shop shows the key at once
// (docs/PLAN.md §10).
public sealed class SupportViewModel : ObservableObject
{
    public SupportViewModel(AppServices services)
    {
        Supporter = new SupporterPanel(services);
        BuyCommand = new RelayCommand(
            () => Browser.Open($"{SupporterOffer.ShopUrl.TrimEnd('/')}/buy?lang={Loc.Instance.Language}"),
            () => CanBuy);
        Loc.Instance.Changed += () =>
        {
            OnPropertyChanged(nameof(MonthlyPrice));
            OnPropertyChanged(nameof(QuarterlyPrice));
            OnPropertyChanged(nameof(YearlyPrice));
            OnPropertyChanged(nameof(BuyText));
        };
    }

    public SupporterPanel Supporter { get; }
    public ICommand BuyCommand { get; }

    public string MonthlyPrice => Price(SupporterOffer.MonthlyPrice, "Support.PerMonth");
    public string QuarterlyPrice => Price(SupporterOffer.QuarterlyPrice, "Support.PerQuarter");
    public string YearlyPrice => Price(SupporterOffer.YearlyPrice, "Support.PerYear");

    // With only a monthly price set, "Yearly: coming soon" beside a real number reads as
    // a promise, so a longer plan's row stays out until it has a price. Before any price is
    // set, all rows show "coming soon" together.
    public bool ShowQuarterly => SupporterOffer.QuarterlyPrice.Length > 0 || SupporterOffer.MonthlyPrice.Length == 0;
    public bool ShowYearly => SupporterOffer.YearlyPrice.Length > 0 || SupporterOffer.MonthlyPrice.Length == 0;
    private static string Price(string value, string per) =>
        value.Length > 0 ? $"{value} {Loc.T(per)}" : Loc.T("Support.PriceSoon");

    // Until the shop is deployed the button is there but disabled, and says so.
    public bool CanBuy => SupporterOffer.ShopUrl.Length > 0;
    // No price on the button: there are three, and the shop's page is where the buyer picks one.
    public string BuyText => CanBuy ? Loc.T("Support.Buy") : Loc.T("Support.BuySoon");
}
