param(
    [Parameter(Mandatory = $true)][string]$ConfigPath
)

# ASCII-only script: Chinese text lives in the UTF-8 JSON config and is read
# with -Encoding UTF8 (Windows PowerShell 5.1 safe).

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'

# Task Scheduler starts this script with a console host; WinForms activation can
# un-hide that console. Hide it explicitly so only the card is visible.
Add-Type -Namespace Reminder -Name ConsoleNative -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
try { [void][Reminder.ConsoleNative]::ShowWindow([Reminder.ConsoleNative]::GetConsoleWindow(), 0) } catch { }

Add-Type -Namespace Reminder -Name Dpi -MemberDefinition @'
[DllImport("user32.dll")]
public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
'@
try { [void][Reminder.Dpi]::SetProcessDpiAwarenessContext([IntPtr]-4) } catch { }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-CfgValue([string]$Name, $Default) {
    if ($cfg.PSObject.Properties.Name -contains $Name) {
        $value = $cfg.$Name
        if ($null -ne $value -and "$value" -ne '') { return $value }
    }
    return $Default
}

$id = [string](Get-CfgValue 'id' 'default')
$safeId = $id -replace '[^A-Za-z0-9._-]', '_'
$title = [string](Get-CfgValue 'title' 'Study Reminder')
$message = [string](Get-CfgValue 'message' '')
if ([string]::IsNullOrWhiteSpace($message)) { $message = $title }
$seconds = [int](Get-CfgValue 'seconds' 25)
$position = [string](Get-CfgValue 'position' 'bottomright')
$hint = [string](Get-CfgValue 'hint' 'Click the card to open DSH')
$focusScript = [string](Get-CfgValue 'focusScript' '')
$dataDir = [string](Get-CfgValue 'dataDir' '')
$logDir = [string](Get-CfgValue 'logDir' '')

function Add-Log([string]$Line) {
    if ([string]::IsNullOrWhiteSpace($logDir)) { return }
    try {
        if (-not (Test-Path -LiteralPath $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        $file = Join-Path $logDir 'popup.log'
        $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::AppendAllText($file, ($stamp + ' ' + $Line + [Environment]::NewLine), $encoding)
    } catch { }
}

# One live card per reminder id. If a card is already on screen, a second
# firing (manual start, catch-up, or a task retry) must not stack another one.
$mutex = $null
$createdNew = $false
try {
    $mutexName = 'Local\DSHStudyReminder_' + $safeId
    $mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
} catch {
    $createdNew = $true
}
if (-not $createdNew) {
    Add-Log ('skip id=' + $safeId + ' reason=already-visible')
    exit 0
}

Add-Log ('show id=' + $safeId + ' title-bytes=' + [System.Text.Encoding]::UTF8.GetByteCount($title))

$code = @'
using System;
using System.Drawing;
using System.Windows.Forms;

public class PopupForm : Form
{
    private Timer timer;
    private Action onActivate;
    private bool activated;

    public PopupForm(string title, string message, int seconds, string position, string hint, Action onActivate)
    {
        this.onActivate = onActivate;
        AutoScaleMode = AutoScaleMode.None;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.FromArgb(28, 30, 36);
        Size = new Size(520, 190);
        Cursor = Cursors.Hand;

        Panel accent = new Panel();
        accent.Dock = DockStyle.Left;
        accent.Width = 8;
        accent.BackColor = Color.FromArgb(64, 158, 255);
        Controls.Add(accent);

        Label lblTitle = new Label();
        lblTitle.Text = title;
        lblTitle.ForeColor = Color.White;
        lblTitle.Font = new Font("Microsoft YaHei UI", 14.5f, FontStyle.Bold);
        lblTitle.UseCompatibleTextRendering = true;
        lblTitle.Bounds = new Rectangle(30, 20, 455, 36);
        lblTitle.AutoEllipsis = true;
        Controls.Add(lblTitle);

        Label lblMsg = new Label();
        lblMsg.Text = message;
        lblMsg.ForeColor = Color.FromArgb(210, 214, 222);
        lblMsg.Font = new Font("Microsoft YaHei UI", 10.5f);
        lblMsg.UseCompatibleTextRendering = true;
        lblMsg.Bounds = new Rectangle(30, 62, 455, 66);
        lblMsg.AutoEllipsis = true;
        Controls.Add(lblMsg);

        Label lblHint = new Label();
        lblHint.Text = hint;
        lblHint.ForeColor = Color.FromArgb(130, 136, 148);
        lblHint.Font = new Font("Microsoft YaHei UI", 8.5f);
        lblHint.UseCompatibleTextRendering = true;
        lblHint.Bounds = new Rectangle(30, 146, 455, 22);
        Controls.Add(lblHint);

        EventHandler activate = delegate { ActivateCard(); };
        Click += activate;
        foreach (Control control in Controls) { control.Click += activate; }

        Shown += delegate { PlaceWindow(position); };

        timer = new Timer();
        timer.Interval = Math.Max(1000, seconds * 1000);
        timer.Tick += delegate { timer.Stop(); Close(); };
        timer.Start();
    }

    private void ActivateCard()
    {
        if (activated) { return; }
        activated = true;
        try { if (onActivate != null) { onActivate(); } } catch { }
        Close();
    }

    private void PlaceWindow(string position)
    {
        Rectangle wa = Screen.FromControl(this).WorkingArea;
        int x;
        int y;
        if (position == "center")
        {
            x = wa.Left + (wa.Width - Width) / 2;
            y = wa.Top + (wa.Height - Height) / 2;
        }
        else
        {
            x = wa.Right - Width - 24;
            y = wa.Bottom - Height - 24;
        }
        x = Math.Max(wa.Left, Math.Min(x, wa.Right - Width));
        y = Math.Max(wa.Top, Math.Min(y, wa.Bottom - Height));
        Location = new Point(x, y);
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE
            return cp;
        }
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms.dll, System.Drawing.dll

$onActivate = [Action]{
    try {
        if (-not [string]::IsNullOrWhiteSpace($focusScript) -and (Test-Path -LiteralPath $focusScript)) {
            $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $focusScript + '"'
            if (-not [string]::IsNullOrWhiteSpace($dataDir)) {
                $argLine = $argLine + ' -DataDir "' + $dataDir + '"'
            }
            Start-Process -FilePath 'powershell.exe' -ArgumentList $argLine -WindowStyle Hidden | Out-Null
            Add-Log ('click-focus id=' + $safeId)
        } else {
            Add-Log ('click-no-focus-script id=' + $safeId)
        }
    } catch {
        Add-Log ('click-error id=' + $safeId + ' detail=' + $_.Exception.Message)
    }
}

$form = New-Object PopupForm($title, $message, $seconds, $position, $hint, $onActivate)
$form.add_Shown({
    try { [void][Reminder.ConsoleNative]::ShowWindow([Reminder.ConsoleNative]::GetConsoleWindow(), 0) } catch { }
    [System.Media.SystemSounds]::Asterisk.Play()
    Add-Log ('shown id=' + $safeId + ' bounds=' + $form.Bounds.ToString())
})

[System.Windows.Forms.Application]::Run($form)

Add-Log ('closed id=' + $safeId)
try { if ($null -ne $mutex) { $mutex.ReleaseMutex() } } catch { }
try { if ($null -ne $mutex) { $mutex.Dispose() } } catch { }
