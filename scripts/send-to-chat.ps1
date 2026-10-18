param(
  [int]$TargetPid = 0,
  [long]$TargetHwnd = 0
)

$logFile = "d:\Projects\AG_Pet\send-chat-debug.log"
function Write-Log($msg) {
  Add-Content -Path $logFile -Value "[$(Get-Date -Format 'HH:mm:ss.fff')] $msg" -ErrorAction SilentlyContinue
}

Write-Log "send-to-chat.ps1 started: TargetPid=$TargetPid, TargetHwnd=$TargetHwnd"

if (-not ([System.Management.Automation.PSTypeName]'Win32ChatSender').Type) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public class Win32ChatSender {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public static IntPtr FindAntigravityWindow(int preferredPid) {
        IntPtr candidate = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindow(hWnd) || !IsWindowVisible(hWnd)) return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return true;

            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            string title = sb.ToString().Trim();
            if (string.IsNullOrEmpty(title)) return true;
            if (title == "OleMainThreadWndName" || title == "Default IME" || title == "MSCTFIME UI") return true;

            try {
                Process proc = Process.GetProcessById((int)pid);
                if (proc.ProcessName.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                    if (preferredPid > 0 && pid == (uint)preferredPid) {
                        candidate = hWnd;
                        return false;
                    }
                    if (candidate == IntPtr.Zero) {
                        candidate = hWnd;
                    }
                }
            } catch {}
            return true;
        }, IntPtr.Zero);
        return candidate;
    }

    public static void ForceActivate(IntPtr hwnd) {
        if (hwnd == IntPtr.Zero) return;
        if (IsIconic(hwnd)) {
            ShowWindowAsync(hwnd, 9); // SW_RESTORE
        } else {
            ShowWindowAsync(hwnd, 5); // SW_SHOW
        }

        // Simulate ALT key to bypass Windows LockSetForegroundWindow restrictions
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);

        IntPtr fg = GetForegroundWindow();
        uint dummy;
        uint fgThread = GetWindowThreadProcessId(fg, out dummy);
        uint curThread = GetCurrentThreadId();
        if (fgThread != curThread && fgThread != 0) {
            AttachThreadInput(curThread, fgThread, true);
            SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
            AttachThreadInput(curThread, fgThread, false);
        } else {
            SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
        }
    }

    public static void SendShiftInsertAndEnter() {
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

        // Shift + Insert (layout-independent across RU/EN layouts)
        keybd_event(0x10, 0x2A, 0, UIntPtr.Zero); // VK_SHIFT down
        keybd_event(0x2D, 0x52, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero); // VK_INSERT down
        System.Threading.Thread.Sleep(60);
        keybd_event(0x2D, 0x52, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero); // VK_INSERT up
        keybd_event(0x10, 0x2A, KEYEVENTF_KEYUP, UIntPtr.Zero); // VK_SHIFT up

        System.Threading.Thread.Sleep(200);

        // Enter (0x0D, scan 0x1C)
        keybd_event(0x0D, 0x1C, 0, UIntPtr.Zero); // Enter down
        System.Threading.Thread.Sleep(60);
        keybd_event(0x0D, 0x1C, KEYEVENTF_KEYUP, UIntPtr.Zero); // Enter up
    }
}
"@
}

$hwnd = [IntPtr]::Zero
if ($TargetHwnd -gt 0) {
  $hwnd = [IntPtr]$TargetHwnd
}

if ($hwnd -eq [IntPtr]::Zero) {
  $hwnd = [Win32ChatSender]::FindAntigravityWindow($TargetPid)
}

if ($hwnd -eq [IntPtr]::Zero) {
  try {
    $tl = tasklist /V /FI "IMAGENAME eq Antigravity.exe" /FO CSV /NH
    foreach ($line in ($tl -split "`r?`n")) {
      if ($line -match '^"Antigravity\.exe","(\d+)",.*,"([^"]+)"$') {
        $p = [int]$matches[1]
        $t = $matches[2]
        if ($t -and $t -ne 'N/A' -and $t -ne 'OleMainThreadWndName') {
          $TargetPid = $p
          Write-Log "Found Antigravity Window PID via tasklist: $TargetPid ($t)"
          $hwnd = [Win32ChatSender]::FindAntigravityWindow($TargetPid)
          if ($hwnd -ne [IntPtr]::Zero) { break }
        }
      }
    }
  } catch {}
}

if ($hwnd -ne [IntPtr]::Zero -and $TargetPid -le 0) {
  $resolvedPid = 0
  [Win32ChatSender]::GetWindowThreadProcessId($hwnd, [ref]$resolvedPid)
  if ($resolvedPid -gt 0) {
    $TargetPid = [int]$resolvedPid
  }
}

Write-Log "Resolved HWND=$hwnd, PID=$TargetPid"

if ($hwnd -ne [IntPtr]::Zero) {
  try {
    $wshell = New-Object -ComObject WScript.Shell
    if ($TargetPid -gt 0) {
      [void]$wshell.AppActivate($TargetPid)
    }
  } catch {}

  [Win32ChatSender]::ForceActivate($hwnd)
  Start-Sleep -Milliseconds 200
  $fgNow = [Win32ChatSender]::GetForegroundWindow()
  Write-Log "Foreground HWND before paste: $fgNow (target=$hwnd)"

  [Win32ChatSender]::SendShiftInsertAndEnter()
  Write-Log "SendShiftInsertAndEnter completed successfully!"
} else {
  Write-Log "ERROR: Could not find any visible Antigravity window"
}
