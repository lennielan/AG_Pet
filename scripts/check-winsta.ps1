Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinCheck {
    [DllImport("kernel32.dll")]
    public static extern int GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetThreadDesktop(int dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);

    public const int UOI_NAME = 2;

    public static string GetObjName(IntPtr handle) {
        StringBuilder sb = new StringBuilder(256);
        int len = 0;
        if (GetUserObjectInformation(handle, UOI_NAME, sb, 256, out len)) {
            return sb.ToString();
        }
        return "Error: " + Marshal.GetLastWin32Error();
    }
}
"@

$desk = [WinCheck]::GetObjName([WinCheck]::GetThreadDesktop([WinCheck]::GetCurrentThreadId()))
Write-Output $desk.Trim()
