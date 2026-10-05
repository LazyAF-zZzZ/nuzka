// Nuzka's installer window. It is a thin front for Velopack's own Setup.exe, which is
// appended to this exe by build-setup.ps1: the wizard asks where to install, extracts the
// payload to %TEMP%, runs it with --silent --installto, and shows progress. Velopack still
// does the real install, so Update.exe and auto-update work exactly as before.
//
// Compiled with the .NET Framework csc that ships with Windows (C# 5, WPF built in code),
// so the installer stays a few hundred KB larger than Velopack's, not 60 MB larger.
//
//   Nuzka-Setup.exe --preview [--page N --snapshot out.png]   UI only, installs nothing
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace NuzkaSetup
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            var app = new Application();
            var w = new WizardWindow(args);
            return app.Run(w);
        }
    }

    class WizardWindow : Window
    {
        const string Magic = "NUZKAPL1";
        const long NeedBytes = 400L * 1024 * 1024;

        static readonly Brush Ink = Frozen(new SolidColorBrush(Color.FromRgb(0xF2, 0xF3, 0xF8)));
        static readonly Brush Soft = Frozen(new SolidColorBrush(Color.FromRgb(0xC9, 0xCC, 0xDA)));
        static readonly Brush Accent = Frozen(new SolidColorBrush(Color.FromRgb(0x5B, 0x8C, 0xFF)));

        readonly bool preview;
        string version = "";
        string installDir;
        int page; // 0 welcome, 1 licence, 2 destination, 3 installing, 4 finish
        bool installing;
        bool succeeded;
        string failure;

        Grid body;
        TextBlock title, subtitle;
        Button back, next, cancel;
        TextBox dirBox;
        TextBlock spaceNote, dirError, status;
        ProgressBar bar;
        CheckBox launch;

        public WizardWindow(string[] args)
        {
            preview = Array.IndexOf(args, "--preview") >= 0;
            string snapshot = ArgValue(args, "--snapshot");
            int startPage = 0;
            int.TryParse(ArgValue(args, "--page"), out startPage);

            version = ReadResource("version").Trim();
            installDir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RovOverlayTool3");

            Title = "Nuzka " + version + " Setup";
            Width = 616; Height = 494;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            FontFamily = new FontFamily("Segoe UI");
            FontSize = 13;
            Foreground = Ink;
            Background = Backdrop();
            UseLayoutRounding = true;
            try { Icon = BitmapFrame.Create(OpenResource("icon")); } catch (Exception) { }

            BuildChrome();
            ShowPage(startPage);

            SourceInitialized += delegate { DarkTitleBar(); };
            Closing += OnClosing;

            if (snapshot != null)
            {
                Loaded += delegate
                {
                    Dispatcher.BeginInvoke(new Action(delegate
                    {
                        Snapshot(snapshot);
                        Close();
                    }), System.Windows.Threading.DispatcherPriority.ContextIdle);
                };
            }
        }

        // ---- chrome shared by every page ------------------------------------------

        void BuildChrome()
        {
            var root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(78) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(64) });

            // header: the page title and one-line question, logo on the right
            var header = new Grid { Margin = new Thickness(4, 14, 18, 0) };
            header.ColumnDefinitions.Add(new ColumnDefinition());
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var heads = new StackPanel();
            title = new TextBlock { Margin = new Thickness(0, 0, 0, 0), FontWeight = FontWeights.Bold, FontSize = 14, Foreground = Ink };
            subtitle = new TextBlock { Margin = new Thickness(14, 6, 0, 0), Foreground = Soft, TextWrapping = TextWrapping.Wrap };
            heads.Children.Add(title);
            heads.Children.Add(subtitle);
            header.Children.Add(heads);
            try
            {
                var logo = new Image { Width = 46, Height = 46, Source = BitmapFrame.Create(OpenResource("logo")), VerticalAlignment = VerticalAlignment.Top };
                RenderOptions.SetBitmapScalingMode(logo, BitmapScalingMode.HighQuality);
                Grid.SetColumn(logo, 1);
                header.Children.Add(logo);
            }
            catch (Exception) { }
            root.Children.Add(header);

            body = new Grid { Margin = new Thickness(18, 4, 18, 0) };
            Grid.SetRow(body, 1);
            root.Children.Add(body);

            var foot = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 18, 0) };
            back = MakeButton("Back", false);
            next = MakeButton("Next", true);
            cancel = MakeButton("Cancel", false);
            back.Click += delegate { if (page > 0 && !installing) ShowPage(page - 1); };
            next.Click += OnNext;
            cancel.Click += delegate { Close(); };
            foot.Children.Add(back);
            foot.Children.Add(next);
            foot.Children.Add(new Border { Width = 14 });
            foot.Children.Add(cancel);
            Grid.SetRow(foot, 2);
            root.Children.Add(foot);

            Content = root;
        }

        Button MakeButton(string text, bool primary)
        {
            var b = new Button
            {
                Content = text,
                Width = 88,
                Height = 28,
                Margin = new Thickness(4, 0, 0, 0),
                Foreground = Ink,
                Background = Frozen(new SolidColorBrush(Color.FromArgb(0xCC, 0x2A, 0x2D, 0x3E))),
                BorderBrush = primary ? Accent : Frozen(new SolidColorBrush(Color.FromRgb(0x5A, 0x5E, 0x75))),
                BorderThickness = new Thickness(primary ? 2 : 1),
                Cursor = Cursors.Hand,
                IsDefault = primary
            };
            b.Template = ButtonTemplate();
            return b;
        }

        // A plain rounded template: the stock WPF button paints a light hover that is
        // unreadable on this background.
        static ControlTemplate ButtonTemplate()
        {
            var t = new ControlTemplate(typeof(Button));
            var border = new FrameworkElementFactory(typeof(Border), "bd");
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
            border.SetBinding(Border.BackgroundProperty, new System.Windows.Data.Binding("Background") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
            border.SetBinding(Border.BorderBrushProperty, new System.Windows.Data.Binding("BorderBrush") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
            border.SetBinding(Border.BorderThicknessProperty, new System.Windows.Data.Binding("BorderThickness") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
            var presenter = new FrameworkElementFactory(typeof(ContentPresenter));
            presenter.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            presenter.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            border.AppendChild(presenter);
            t.VisualTree = border;
            var hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(Border.BackgroundProperty, new SolidColorBrush(Color.FromArgb(0xEE, 0x3A, 0x3E, 0x56)), "bd"));
            t.Triggers.Add(hover);
            var off = new Trigger { Property = UIElement.IsEnabledProperty, Value = false };
            off.Setters.Add(new Setter(UIElement.OpacityProperty, 0.45, "bd"));
            t.Triggers.Add(off);
            return t;
        }

        // ---- pages -----------------------------------------------------------------

        void ShowPage(int p)
        {
            page = p;
            body.Children.Clear();
            back.IsEnabled = true;
            back.Visibility = (p == 0 || p >= 3) ? Visibility.Hidden : Visibility.Visible;
            next.IsEnabled = true;
            cancel.IsEnabled = true;
            cancel.Visibility = p == 4 ? Visibility.Collapsed : Visibility.Visible;

            if (p == 0) PageWelcome();
            else if (p == 1) PageLicense();
            else if (p == 2) PageDestination();
            else if (p == 3) PageInstalling();
            else PageFinish();
        }

        void PageWelcome()
        {
            title.Text = "Welcome to Nuzka";
            subtitle.Text = "This will install Nuzka " + version + " on your computer.";
            next.Content = "Next";
            var t = Note("Nuzka runs your tournament and sends the pick/ban overlays to OBS.\n\n"
                + "It installs just for you, so Windows will not ask for administrator rights, and it keeps itself up to date.\n\n"
                + "Click Next to continue.");
            t.Margin = new Thickness(14, 34, 0, 0);
            t.MaxWidth = 500;
            t.HorizontalAlignment = HorizontalAlignment.Left;
            t.VerticalAlignment = VerticalAlignment.Top;
            body.Children.Add(t);
            body.Children.Add(BottomNote("Click Next to continue, or Cancel to exit Setup."));
        }

        void PageLicense()
        {
            title.Text = "License Agreement";
            subtitle.Text = "Please read the following important information before continuing.";
            next.Content = "Next";

            var sp = new Grid { Margin = new Thickness(14, 18, 0, 0) };
            sp.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            sp.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            sp.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var intro = Note("Please read the following License Agreement. You must accept the terms of this agreement before continuing with the installation.");
            intro.Margin = new Thickness(0, 0, 0, 8);
            sp.Children.Add(intro);
            var box = new TextBox
            {
                Text = PlainLicense(),
                IsReadOnly = true,
                TextWrapping = TextWrapping.Wrap,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Background = Frozen(new SolidColorBrush(Color.FromRgb(0xF0, 0xF0, 0xF0))),
                Foreground = Frozen(new SolidColorBrush(Color.FromRgb(0x10, 0x10, 0x10))),
                Padding = new Thickness(6, 4, 6, 4)
            };
            Grid.SetRow(box, 1);
            sp.Children.Add(box);
            var radios = new StackPanel { Margin = new Thickness(0, 10, 0, 8) };
            var yes = new RadioButton { Content = "I accept the agreement", Foreground = Ink, Margin = new Thickness(0, 0, 0, 6), IsChecked = licenceAccepted };
            var no = new RadioButton { Content = "I do not accept the agreement", Foreground = Ink, IsChecked = !licenceAccepted };
            yes.Checked += delegate { licenceAccepted = true; next.IsEnabled = true; };
            no.Checked += delegate { licenceAccepted = false; next.IsEnabled = false; };
            radios.Children.Add(yes);
            radios.Children.Add(no);
            Grid.SetRow(radios, 2);
            sp.Children.Add(radios);
            body.Children.Add(sp);
            next.IsEnabled = licenceAccepted;
        }

        // LICENSE.md is Markdown; show it as plain text.
        static string PlainLicense()
        {
            var sb = new StringBuilder();
            foreach (string raw in ReadResource("license").Replace("\r", "").Split('\n'))
            {
                string l = raw;
                while (l.StartsWith("#")) l = l.Substring(1);
                if (l.StartsWith(" ") && raw.StartsWith("#")) l = l.Substring(1);
                if (l.StartsWith("- ")) l = ((char)0x2022).ToString() + " " + l.Substring(2);
                sb.Append(l).Append("\r\n");
            }
            return sb.ToString().Trim();
        }

        bool licenceAccepted;

        void PageDestination()
        {
            title.Text = "Select Destination Location";
            subtitle.Text = "Where should Nuzka be installed?";
            next.Content = "Install";

            var sp = new StackPanel { VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 30, 0, 0) };

            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(14, 0, 0, 0) };
            row.Children.Add(FolderGlyph());
            var line = Note("Setup will install Nuzka into the following folder.");
            line.Margin = new Thickness(26, 0, 0, 0);
            line.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(line);
            sp.Children.Add(row);

            var prompt = Note("To continue, click Install. If you would like to select a different folder, click Browse.");
            prompt.Margin = new Thickness(14, 22, 0, 8);
            sp.Children.Add(prompt);

            var pick = new Grid { Margin = new Thickness(14, 0, 0, 0) };
            pick.ColumnDefinitions.Add(new ColumnDefinition());
            pick.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            dirBox = new TextBox
            {
                Text = installDir,
                Height = 28,
                VerticalContentAlignment = VerticalAlignment.Center,
                Padding = new Thickness(4, 0, 4, 0),
                Background = Frozen(new SolidColorBrush(Color.FromArgb(0xE6, 0x10, 0x12, 0x1C))),
                Foreground = Ink,
                CaretBrush = Ink,
                SelectionBrush = Accent,
                BorderBrush = Accent,
                BorderThickness = new Thickness(1)
            };
            dirBox.TextChanged += delegate { installDir = dirBox.Text; RefreshSpace(); };
            pick.Children.Add(dirBox);
            var browse = MakeButton("Browse...", false);
            browse.Margin = new Thickness(10, 0, 0, 0);
            browse.Click += delegate { Browse(); };
            Grid.SetColumn(browse, 1);
            pick.Children.Add(browse);
            sp.Children.Add(pick);

            dirError = new TextBlock { Margin = new Thickness(14, 8, 0, 0), Foreground = Frozen(new SolidColorBrush(Color.FromRgb(0xFF, 0x7A, 0x8A))), TextWrapping = TextWrapping.Wrap };
            sp.Children.Add(dirError);
            body.Children.Add(sp);

            spaceNote = Note("");
            spaceNote.Margin = new Thickness(0, 0, 0, 10);
            spaceNote.VerticalAlignment = VerticalAlignment.Bottom;
            spaceNote.Margin = new Thickness(14, 0, 0, 14);
            body.Children.Add(spaceNote);
            RefreshSpace();
            dirBox.Focus();
            dirBox.SelectAll();
        }

        void PageInstalling()
        {
            title.Text = "Installing";
            subtitle.Text = "Please wait while Setup installs Nuzka on your computer.";
            back.Visibility = Visibility.Hidden;
            next.IsEnabled = false;
            next.Content = "Next";
            cancel.IsEnabled = false;

            var sp = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(14, 0, 0, 20) };
            status = Note("Copying files...");
            status.Margin = new Thickness(0, 0, 0, 10);
            sp.Children.Add(status);
            bar = new ProgressBar { Height = 14, IsIndeterminate = true, Foreground = Accent, Background = Frozen(new SolidColorBrush(Color.FromArgb(0x99, 0x10, 0x12, 0x1C))), BorderBrush = Frozen(new SolidColorBrush(Color.FromRgb(0x3A, 0x3E, 0x56))) };
            sp.Children.Add(bar);
            var small = Note("This takes about a minute. Nuzka is installed to " + installDir);
            small.Margin = new Thickness(0, 10, 0, 0);
            small.Foreground = Frozen(new SolidColorBrush(Color.FromRgb(0x9A, 0x9E, 0xB4)));
            sp.Children.Add(small);
            body.Children.Add(sp);
        }

        void PageFinish()
        {
            cancel.Visibility = Visibility.Collapsed;
            back.Visibility = Visibility.Hidden;
            next.IsEnabled = true;
            next.Content = "Finish";
            if (succeeded)
            {
                title.Text = "Setup is complete";
                subtitle.Text = "Nuzka has been installed on your computer.";
                var sp = new StackPanel { VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(14, 34, 0, 0) };
                sp.Children.Add(Note("A shortcut was added to your desktop and Start menu. Nuzka checks for updates by itself and tells you when one is ready."));
                launch = new CheckBox { Content = "Launch Nuzka", IsChecked = true, Foreground = Ink, Margin = new Thickness(0, 24, 0, 0) };
                sp.Children.Add(launch);
                body.Children.Add(sp);
            }
            else
            {
                title.Text = "Setup could not finish";
                subtitle.Text = "Nuzka was not installed.";
                var t = Note(failure ?? "Something went wrong.");
                t.Margin = new Thickness(14, 34, 0, 0);
                t.VerticalAlignment = VerticalAlignment.Top;
                body.Children.Add(t);
            }
        }

        // ---- actions ---------------------------------------------------------------

        void OnNext(object sender, RoutedEventArgs e)
        {
            if (page == 0) { ShowPage(1); return; }
            if (page == 1) { ShowPage(2); return; }
            if (page == 2)
            {
                string problem = CheckDir(installDir);
                if (problem != null) { dirError.Text = problem; return; }
                BeginInstall();
                return;
            }
            if (page == 4)
            {
                if (succeeded && launch != null && launch.IsChecked == true) StartApp();
                Close();
            }
        }

        void Browse()
        {
            using (var d = new System.Windows.Forms.FolderBrowserDialog())
            {
                d.Description = "Select the folder Nuzka should be installed in.";
                d.ShowNewFolderButton = true;
                try { if (Directory.Exists(installDir)) d.SelectedPath = installDir; } catch (Exception) { }
                if (d.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                    dirBox.Text = d.SelectedPath;
            }
        }

        string CheckDir(string dir)
        {
            if (string.IsNullOrWhiteSpace(dir)) return "Choose a folder.";
            try
            {
                string full = System.IO.Path.GetFullPath(dir);
                if (!System.IO.Path.IsPathRooted(full)) return "Enter a full path, such as C:\\Nuzka.";
                string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                if (full.StartsWith(pf, StringComparison.OrdinalIgnoreCase) || full.StartsWith(pf86, StringComparison.OrdinalIgnoreCase))
                    return "Nuzka installs just for you and updates itself, so it cannot live in Program Files. Pick a folder you own, such as the default.";
                Directory.CreateDirectory(full);
                string probe = System.IO.Path.Combine(full, ".nuzka-write-test");
                File.WriteAllText(probe, "x");
                File.Delete(probe);
                installDir = full;
                return null;
            }
            catch (Exception ex)
            {
                return "Setup cannot write to that folder (" + ex.Message + ").";
            }
        }

        void RefreshSpace()
        {
            if (spaceNote == null) return;
            string text = "At least 400 MB of free disk space is required.";
            try
            {
                string root = System.IO.Path.GetPathRoot(System.IO.Path.GetFullPath(installDir));
                var di = new DriveInfo(root);
                if (di.IsReady && di.AvailableFreeSpace < NeedBytes)
                    text += "  That drive has only " + (di.AvailableFreeSpace / (1024 * 1024)) + " MB free.";
            }
            catch (Exception) { }
            spaceNote.Text = text;
        }

        void BeginInstall()
        {
            installing = true;
            ShowPage(3);
            string dir = installDir;
            var worker = new Thread(delegate() { RunInstall(dir); });
            worker.IsBackground = true;
            worker.Start();
        }

        void RunInstall(string dir)
        {
            string err = null;
            try
            {
                if (preview) { Thread.Sleep(2500); }
                else
                {
                    string exe = ExtractPayload();
                    var psi = new ProcessStartInfo(exe, "--silent --installto \"" + dir + "\"");
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    using (var p = Process.Start(psi))
                    {
                        p.WaitForExit();
                        if (p.ExitCode != 0) err = "The installer stopped with code " + p.ExitCode + ". Close Nuzka if it is running and try again.";
                    }
                    try { File.Delete(exe); } catch (Exception) { }
                }
            }
            catch (Exception ex) { err = ex.Message; }

            Dispatcher.BeginInvoke(new Action(delegate
            {
                installing = false;
                succeeded = err == null;
                failure = err;
                ShowPage(4);
            }));
        }

        // The exe is [wizard][Velopack Setup.exe][8-byte length][8-byte magic].
        string ExtractPayload()
        {
            string self = Assembly.GetExecutingAssembly().Location;
            string path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "Nuzka-Setup-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
            using (var fs = new FileStream(self, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                var tail = new byte[16];
                fs.Seek(-16, SeekOrigin.End);
                fs.Read(tail, 0, 16);
                if (Encoding.ASCII.GetString(tail, 8, 8) != Magic)
                    throw new InvalidOperationException("This installer file is incomplete. Download it again.");
                long len = BitConverter.ToInt64(tail, 0);
                fs.Seek(-16 - len, SeekOrigin.End);
                using (var o = new FileStream(path, FileMode.Create, FileAccess.Write))
                {
                    var buf = new byte[1024 * 1024];
                    long left = len;
                    while (left > 0)
                    {
                        int n = fs.Read(buf, 0, (int)Math.Min(buf.Length, left));
                        if (n <= 0) throw new EndOfStreamException();
                        o.Write(buf, 0, n);
                        left -= n;
                    }
                }
            }
            return path;
        }

        void StartApp()
        {
            try
            {
                string exe = System.IO.Path.Combine(installDir, "current", "RovOverlayTool.exe");
                if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true, WorkingDirectory = System.IO.Path.GetDirectoryName(exe) });
            }
            catch (Exception) { }
        }

        void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (installing) { e.Cancel = true; return; }
            if (page < 3 && !preview && Snapshotting == false)
            {
                var r = MessageBox.Show(this, "Setup is not complete. If you exit now, Nuzka will not be installed.\n\nExit Setup?", "Exit Setup", MessageBoxButton.YesNo, MessageBoxImage.Question);
                if (r != MessageBoxResult.Yes) e.Cancel = true;
            }
        }

        // ---- look ------------------------------------------------------------------

        static Brush Backdrop()
        {
            var g = new DrawingGroup();
            var bounds = new Rect(0, 0, 616, 494);
            var basis = new LinearGradientBrush(Color.FromRgb(0x07, 0x09, 0x16), Color.FromRgb(0x14, 0x07, 0x14), 35);
            g.Children.Add(new GeometryDrawing(basis, null, new RectangleGeometry(bounds)));
            // blue bloom lower left, red bloom lower right, like the artwork
            g.Children.Add(new GeometryDrawing(Bloom(Color.FromArgb(0xB0, 0x2B, 0x44, 0xE0), 0.12, 0.88), null, new RectangleGeometry(bounds)));
            g.Children.Add(new GeometryDrawing(Bloom(Color.FromArgb(0xB8, 0xC4, 0x1E, 0x3C), 0.92, 0.9), null, new RectangleGeometry(bounds)));
            // soft ribbon strokes
            g.Children.Add(Ribbon("M -20,300 C 120,230 220,420 380,350 S 560,250 640,300", Color.FromArgb(0x30, 0x6C, 0x8C, 0xFF), 22));
            g.Children.Add(Ribbon("M -20,380 C 160,330 260,470 420,420 S 580,360 640,400", Color.FromArgb(0x2A, 0xE0, 0x3A, 0x5C), 30));
            g.Children.Add(Ribbon("M 120,520 C 240,380 360,470 460,330 S 560,300 640,200", Color.FromArgb(0x1C, 0xFF, 0x7A, 0x9A), 14));
            g.ClipGeometry = new RectangleGeometry(bounds);
            var b = new DrawingBrush(g) { Stretch = Stretch.Fill, Viewbox = bounds, ViewboxUnits = BrushMappingMode.Absolute };
            b.Freeze();
            return b;
        }

        static Brush Bloom(Color c, double cx, double cy)
        {
            var b = new RadialGradientBrush
            {
                Center = new Point(cx, cy),
                GradientOrigin = new Point(cx, cy),
                RadiusX = 0.62,
                RadiusY = 0.7
            };
            b.GradientStops.Add(new GradientStop(c, 0));
            b.GradientStops.Add(new GradientStop(Color.FromArgb(0, c.R, c.G, c.B), 1));
            return b;
        }

        static Drawing Ribbon(string data, Color c, double width)
        {
            var pen = new Pen(new SolidColorBrush(c), width) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            return new GeometryDrawing(null, pen, Geometry.Parse(data));
        }

        static FrameworkElement FolderGlyph()
        {
            var c = new Canvas { Width = 30, Height = 26 };
            c.Children.Add(new System.Windows.Shapes.Path { Data = Geometry.Parse("M0,3 Q0,0 3,0 L10,0 L13,4 L27,4 Q30,4 30,7 L30,23 Q30,26 27,26 L3,26 Q0,26 0,23 Z"), Fill = Frozen(new SolidColorBrush(Color.FromRgb(0xF2, 0xD3, 0x5C))) });
            c.Children.Add(new System.Windows.Shapes.Path { Data = Geometry.Parse("M0,10 L30,10 L30,23 Q30,26 27,26 L3,26 Q0,26 0,23 Z"), Fill = Frozen(new SolidColorBrush(Color.FromRgb(0xFF, 0xE7, 0x7A))) });
            return c;
        }

        TextBlock Note(string text)
        {
            return new TextBlock { Text = text, Foreground = Ink, TextWrapping = TextWrapping.Wrap, LineHeight = 19 };
        }

        TextBlock BottomNote(string text)
        {
            var t = Note(text);
            t.VerticalAlignment = VerticalAlignment.Bottom;
            t.Margin = new Thickness(14, 0, 0, 14);
            return t;
        }

        void DarkTitleBar()
        {
            try
            {
                IntPtr h = new WindowInteropHelper(this).Handle;
                int on = 1;
                DwmSetWindowAttribute(h, 20, ref on, 4);
            }
            catch (Exception) { }
        }

        [DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        // ---- helpers ---------------------------------------------------------------

        bool Snapshotting;

        void Snapshot(string path)
        {
            Snapshotting = true;
            var el = (FrameworkElement)Content;
            var rtb = new RenderTargetBitmap((int)ActualWidth, (int)ActualHeight, 96, 96, PixelFormats.Pbgra32);
            var vis = new DrawingVisual();
            using (var dc = vis.RenderOpen())
            {
                dc.DrawRectangle(Background, null, new Rect(0, 0, ActualWidth, ActualHeight));
                dc.DrawRectangle(new VisualBrush(el), null, new Rect(0, 0, el.ActualWidth, el.ActualHeight));
            }
            rtb.Render(vis);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(rtb));
            using (var f = File.Create(path)) enc.Save(f);
        }

        static string ArgValue(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            return (i >= 0 && i + 1 < args.Length) ? args[i + 1] : null;
        }

        static Stream OpenResource(string name)
        {
            return Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        }

        static string ReadResource(string name)
        {
            try { using (var r = new StreamReader(OpenResource(name))) return r.ReadToEnd(); }
            catch (Exception) { return ""; }
        }

        static T Frozen<T>(T f) where T : Freezable
        {
            f.Freeze();
            return f;
        }
    }
}
