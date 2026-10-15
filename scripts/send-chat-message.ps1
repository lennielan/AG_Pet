param(
    [string]$TargetHwnd = "",
    [int]$TargetPid = 0
)

$sig = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

namespace AGPetWin32 {
    public static class Native {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        public static IntPtr FindAntigravityWindow() {
            IntPtr found = IntPtr.Zero;
            EnumWindows((hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();
                    if (!string.IsNullOrEmpty(title) && title != "Default IME" && title != "MSCTFIME UI" && title != "OleMainThreadWndName") {
                        uint pid;
                        GetWindowThreadProcessId(hWnd, out pid);
                        try {
                            var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                            if (proc.ProcessName.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                                found = hWnd;
                                return false;
                            }
                        } catch {}
                    }
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }
    }
}
"@

Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue

# 1. Resolve Target HWND
$hwnd = [IntPtr]::Zero

if (![string]::IsNullOrWhiteSpace($TargetHwnd)) {
    try {
        $parsed = [Int64]$TargetHwnd
        if ($parsed -ne 0) {
            $hwnd = [IntPtr]$parsed
        }
    } catch {}
}

# If TargetHwnd not given or zero, find from TargetPid or Get-Process
if ($hwnd -eq [IntPtr]::Zero -and $TargetPid -gt 0) {
    try {
        $p = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
            $hwnd = $p.MainWindowHandle
        }
    } catch {}
}

# Fallback 1: Find any active Antigravity window via Get-Process
if ($hwnd -eq [IntPtr]::Zero) {
    try {
        $p = Get-Process -Name 'Antigravity','Antigravity IDE' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
        if ($p) {
            $hwnd = $p.MainWindowHandle
        }
    } catch {}
}

# Fallback 2: EnumWindows search across top-level visible windows
if ($hwnd -eq [IntPtr]::Zero) {
    try {
        $hwnd = [AGPetWin32.Native]::FindAntigravityWindow()
    } catch {}
}

if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output "ERROR: Antigravity window handle not found"
    exit 1
}

# 2. Restore if minimized (SW_RESTORE = 9), but do not disturb if already maximized/normal
if ([AGPetWin32.Native]::IsIconic($hwnd)) {
    [AGPetWin32.Native]::ShowWindow($hwnd, 9)
}

# 3. Bring window to foreground with thread attachment
$targetThreadId = 0
[AGPetWin32.Native]::GetWindowThreadProcessId($hwnd, [ref]$targetThreadId)
$currentThreadId = [AGPetWin32.Native]::GetCurrentThreadId()

if ($targetThreadId -ne 0 -and $currentThreadId -ne 0 -and $targetThreadId -ne $currentThreadId) {
    [AGPetWin32.Native]::AttachThreadInput($currentThreadId, $targetThreadId, $true)
}

[AGPetWin32.Native]::SetForegroundWindow($hwnd)

if ($targetThreadId -ne 0 -and $currentThreadId -ne 0 -and $targetThreadId -ne $currentThreadId) {
    [AGPetWin32.Native]::AttachThreadInput($currentThreadId, $targetThreadId, $false)
}

# Also use WScript.Shell AppActivate as secondary reinforcement
try {
    $wshell = New-Object -ComObject WScript.Shell
    if ($TargetPid -gt 0) {
        $wshell.AppActivate($TargetPid)
    }
} catch {}

# 4. Wait 220ms for Antigravity WebView to activate text caret
Start-Sleep -Milliseconds 220

# 5. Send hardware virtual keycodes via keybd_event (layout-independent)
# VK_CONTROL = 0x11
# VK_V = 0x56
# VK_RETURN = 0x0D
# KEYEVENTF_KEYUP = 2

# Ctrl+V Down
[AGPetWin32.Native]::keybd_event(0x11, 0, 0, 0)
[AGPetWin32.Native]::keybd_event(0x56, 0, 0, 0)
Start-Sleep -Milliseconds 30

# Ctrl+V Up
[AGPetWin32.Native]::keybd_event(0x56, 0, 2, 0)
[AGPetWin32.Native]::keybd_event(0x11, 0, 2, 0)

# Allow 100ms for Antigravity editor to receive pasted text
Start-Sleep -Milliseconds 100

# Enter Down
[AGPetWin32.Native]::keybd_event(0x0D, 0, 0, 0)
Start-Sleep -Milliseconds 30

# Enter Up
[AGPetWin32.Native]::keybd_event(0x0D, 0, 2, 0)

Write-Output "SUCCESS"
