param(
    [string]$DataDir = '',
    [int]$ProcessId = 0
)

# ASCII-only. Brings the DeepSeek Harness desktop window to the foreground.
# If the app is closed, it launches the executable recorded by the plugin and
# focuses the window once it appears. Exits 0 and prints FOCUSED=1 / FOCUSED=0.

$ErrorActionPreference = 'Continue'
$WarningPreference = 'SilentlyContinue'

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

Add-Type -Namespace FocusConsole -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
try { [void][FocusConsole.Native]::ShowWindow([FocusConsole.Native]::GetConsoleWindow(), 0) } catch { }

$appPath = ''
$dshUrl = ''
if (-not [string]::IsNullOrWhiteSpace($DataDir)) {
    $runtimePath = Join-Path $DataDir 'runtime.json'
    if (Test-Path -LiteralPath $runtimePath) {
        try {
            $runtime = Get-Content -LiteralPath $runtimePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($runtime.PSObject.Properties.Name -contains 'appPath') { $appPath = [string]$runtime.appPath }
            if ($runtime.PSObject.Properties.Name -contains 'dshUrl') { $dshUrl = [string]$runtime.dshUrl }
        } catch { }
    }
}

if (-not ('FocusNative' -as [type])) {
    $code = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class FocusNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool attachFlag);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    public const uint GW_OWNER = 4;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int SW_SHOW = 5;
    public const int SW_MINIMIZE = 6;
    public const int SW_RESTORE = 9;
    public const byte VK_MENU = 0x12;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    public class Info
    {
        public IntPtr Hwnd;
        public int Pid;
        public bool Visible;
        public bool Owned;
        public bool Iconic;
        public bool ToolWindow;
        public string ClassName;
        public string Title;
        public long Area;
    }

    public static string ClassOf(IntPtr hWnd)
    {
        StringBuilder builder = new StringBuilder(256);
        GetClassName(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    public static string TitleOf(IntPtr hWnd)
    {
        StringBuilder builder = new StringBuilder(512);
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    public static long AreaOf(IntPtr hWnd)
    {
        RECT rect;
        if (!GetWindowRect(hWnd, out rect)) { return -1; }
        long width = (long)rect.Right - (long)rect.Left;
        long height = (long)rect.Bottom - (long)rect.Top;
        if (width < 0) { width = -width; }
        if (height < 0) { height = -height; }
        return width * height;
    }

    public static List<Info> Windows()
    {
        List<Info> list = new List<Info>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
        {
            Info info = new Info();
            info.Hwnd = hWnd;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            info.Pid = (int)pid;
            info.Visible = IsWindowVisible(hWnd);
            info.Owned = GetWindow(hWnd, GW_OWNER) != IntPtr.Zero;
            info.Iconic = IsIconic(hWnd);
            info.ClassName = ClassOf(hWnd);
            info.Title = TitleOf(hWnd);
            info.ToolWindow = (GetWindowLong(hWnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0;
            info.Area = AreaOf(hWnd);
            list.Add(info);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static void AltTap()
    {
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(15);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        System.Threading.Thread.Sleep(15);
    }

    public static void ForceForeground(IntPtr hWnd)
    {
        IntPtr foregroundWindow = GetForegroundWindow();
        uint ignored = 0;
        uint foregroundThread = GetWindowThreadProcessId(foregroundWindow, out ignored);
        uint currentThread = GetCurrentThreadId();
        bool attached = false;
        try
        {
            if (foregroundThread != 0 && foregroundThread != currentThread)
            {
                attached = AttachThreadInput(currentThread, foregroundThread, true);
            }
            AltTap();
            SetForegroundWindow(hWnd);
        }
        finally
        {
            if (attached) { AttachThreadInput(currentThread, foregroundThread, false); }
        }
    }
}
'@
    Add-Type -TypeDefinition $code -Language CSharp -ErrorAction Stop
}

function Get-TargetProcessIds {
    $ids = @{}
    foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
        if ($process.ProcessName -match 'DeepSeek|Harness') { $ids[[int]$process.Id] = $true }
    }
    return $ids
}

function Find-Candidate {
    param([hashtable]$ProcessIds, [int]$OnlyPid)
    $windows = [FocusNative]::Windows()
    $list = @()
    foreach ($window in $windows) {
        if ($window.Owned) { continue }
        if ($window.ToolWindow) { continue }
        if ([string]::IsNullOrEmpty($window.ClassName)) { continue }
        $titleMatch = ($window.Title -like '*DeepSeek*')
        $isClass = ($window.ClassName -eq 'Chrome_WidgetWin_1')
        if (-not $isClass -and -not $titleMatch) { continue }
        if ($OnlyPid -gt 0) {
            if ($window.Pid -ne $OnlyPid) { continue }
        } elseif (-not $ProcessIds.ContainsKey([int]$window.Pid) -and -not $titleMatch) {
            continue
        }
        if ($window.ClassName -match '^(Progman|WorkerW|Shell_TrayWnd)$') { continue }
        $list += [pscustomobject]@{
            Hwnd      = $window.Hwnd
            Pid       = [int]$window.Pid
            Visible   = [bool]$window.Visible
            Iconic    = [bool]$window.Iconic
            Title     = $window.Title
            ClassName = $window.ClassName
            Area      = [long]$window.Area
            IsClass   = [bool]$isClass
            TitleHit  = [bool]$titleMatch
        }
    }
    $list = @($list | Sort-Object -Property @(
        @{ Expression = { [int]$_.TitleHit }; Descending = $true },
        @{ Expression = { [int]$_.IsClass }; Descending = $true },
        @{ Expression = { [int]$_.Visible }; Descending = $true },
        @{ Expression = { [long]$_.Area }; Descending = $true }
    ))
    return $list
}

function Invoke-Focus {
    param($Candidate)
    $handle = [IntPtr]$Candidate.Hwnd
    if ([FocusNative]::GetForegroundWindow() -eq $handle) { return $true }
    [void][FocusNative]::ShowWindow($handle, [FocusNative]::SW_SHOW)
    if ([FocusNative]::IsIconic($handle)) { [void][FocusNative]::ShowWindow($handle, [FocusNative]::SW_RESTORE) }
    Start-Sleep -Milliseconds 60
    [FocusNative]::ForceForeground($handle)
    $deadline = (Get-Date).AddMilliseconds(350)
    while ((Get-Date) -lt $deadline) {
        if ([FocusNative]::GetForegroundWindow() -eq $handle) { return $true }
        Start-Sleep -Milliseconds 25
    }
    [void][FocusNative]::ShowWindow($handle, [FocusNative]::SW_MINIMIZE)
    Start-Sleep -Milliseconds 60
    [void][FocusNative]::ShowWindow($handle, [FocusNative]::SW_RESTORE)
    Start-Sleep -Milliseconds 60
    [FocusNative]::ForceForeground($handle)
    Start-Sleep -Milliseconds 150
    return ([FocusNative]::GetForegroundWindow() -eq $handle)
}

try {
    if ($ProcessId -gt 0) {
        $candidates = @(Find-Candidate -ProcessIds @{} -OnlyPid $ProcessId)
    } else {
        $candidates = @(Find-Candidate -ProcessIds (Get-TargetProcessIds) -OnlyPid 0)
    }

    if ($candidates.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($appPath) -and (Test-Path -LiteralPath $appPath)) {
        try { Start-Process -FilePath $appPath | Out-Null } catch { }
        $deadline = (Get-Date).AddSeconds(35)
        while ((Get-Date) -lt $deadline -and $candidates.Count -eq 0) {
            Start-Sleep -Milliseconds 400
            $candidates = @(Find-Candidate -ProcessIds (Get-TargetProcessIds) -OnlyPid 0)
        }
    }

    if ($candidates.Count -gt 0) {
        $focused = Invoke-Focus -Candidate $candidates[0]
        if ($focused) { [Console]::Out.WriteLine('FOCUSED=1'); exit 0 }
    }

    if (-not [string]::IsNullOrWhiteSpace($dshUrl)) {
        try { Start-Process $dshUrl | Out-Null } catch { }
    }

    [Console]::Out.WriteLine('FOCUSED=0')
    exit 0
} catch {
    [Console]::Out.WriteLine('FOCUSED=0')
    exit 0
}
