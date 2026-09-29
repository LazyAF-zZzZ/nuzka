using System.Windows.Controls;
using System.Windows.Input;
using RovOverlay.Desktop.ViewModels;

namespace RovOverlay.Desktop.Views;

public partial class DesignView : UserControl
{
    public DesignView() => InitializeComponent();

    private DesignViewModel? Vm => DataContext as DesignViewModel;

    // The teams-per-set box is read on Enter or when it loses focus, not on every key:
    // typing "24" would otherwise re-split the overlay at "2" (clamped to 4) on the way.
    private void PerSetBox_GotFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        if (Vm is { } vm) vm.PerSetEditing = true;
    }

    private void PerSetBox_LostFocus(object sender, KeyboardFocusChangedEventArgs e) => CommitPerSet(done: true);

    private void PerSetBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        CommitPerSet(done: false);
        PerSetBox.SelectAll();
        e.Handled = true;
    }

    private void CommitPerSet(bool done)
    {
        PerSetBox.GetBindingExpression(TextBox.TextProperty)?.UpdateSource();
        if (Vm is not { } vm) return;
        vm.CommitPerSetText();
        PerSetBox.GetBindingExpression(TextBox.TextProperty)?.UpdateTarget();
        if (done) vm.PerSetEditing = false;
    }

    // Scroll speed reads the same way, and for the same reason: typing "120" would
    // otherwise run the overlay at 1 px/s (clamped to 10) on the way through.
    private void SpeedBox_GotFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        if (Vm is { } vm) vm.SpeedEditing = true;
    }

    private void SpeedBox_LostFocus(object sender, KeyboardFocusChangedEventArgs e) => CommitSpeed(done: true);

    private void SpeedBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        CommitSpeed(done: false);
        SpeedBox.SelectAll();
        e.Handled = true;
    }

    private void CommitSpeed(bool done)
    {
        SpeedBox.GetBindingExpression(TextBox.TextProperty)?.UpdateSource();
        if (Vm is not { } vm) return;
        vm.CommitScrollSpeedText();
        SpeedBox.GetBindingExpression(TextBox.TextProperty)?.UpdateTarget();
        if (done) vm.SpeedEditing = false;
    }
}
