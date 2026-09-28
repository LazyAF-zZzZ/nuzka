using System.IO;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
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

// The Support screen: what supporting gets you, what it costs, how to pay, and the key
// box, so someone can go from "what is this watermark" to a clean overlay on one page.
// Nothing here is bought inside the app; payment happens by PromptPay and the maker sends
// the key (docs/PLAN.md §10).
public sealed class SupportViewModel : ObservableObject
{
    public SupportViewModel(AppServices services)
    {
        Supporter = new SupporterPanel(services);
        ContactCommand = new RelayCommand(() => Browser.Open(SupporterOffer.ContactUrl));
        QrImage = LoadQr();
        Loc.Instance.Changed += () =>
        {
            OnPropertyChanged(nameof(MonthlyPrice));
            OnPropertyChanged(nameof(YearlyPrice));
            OnPropertyChanged(nameof(ContactText));
        };
    }

    public SupporterPanel Supporter { get; }
    public ICommand ContactCommand { get; }

    public string MonthlyPrice => Price(SupporterOffer.MonthlyPrice, "Support.PerMonth");
    public string YearlyPrice => Price(SupporterOffer.YearlyPrice, "Support.PerYear");
    private static string Price(string value, string per) =>
        value.Length > 0 ? $"{value} {Loc.T(per)}" : Loc.T("Support.PriceSoon");

    public bool HasContact => SupporterOffer.ContactUrl.Length > 0;
    public string ContactText => HasContact
        ? (SupporterOffer.ContactLabel.Length > 0 ? SupporterOffer.ContactLabel : Loc.T("Support.Contact"))
        : Loc.T("Support.ContactSoon");

    public ImageSource? QrImage { get; }
    public bool HasQr => QrImage is not null;

    private static ImageSource? LoadQr()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "promptpay-qr.png");
        if (!File.Exists(path)) return null;
        try
        {
            var image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;   // do not hold the file open
            image.UriSource = new Uri(path);
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch
        {
            return null;   // a broken picture is the same as no picture
        }
    }
}
