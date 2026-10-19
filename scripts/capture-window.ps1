param([string]$TitlePrefix, [string]$Out)
# Saves a PNG of ONE window's own contents (PrintWindow), so other windows on top of it are never captured.
# Dev/test helper.
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public struct RECT { public int L, T, R, B; }
public static class U {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "$TitlePrefix*" } | Select-Object -First 1
if (-not $p) { Write-Error "window not found"; exit 1 }
if ([U]::IsIconic($p.MainWindowHandle)) { [void][U]::ShowWindow($p.MainWindowHandle, 4); Start-Sleep -Milliseconds 800 }
$r = New-Object RECT
[void][U]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.R - $r.L; $h = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[void][U]::PrintWindow($p.MainWindowHandle, $hdc, 2)   # 2 = PW_RENDERFULLCONTENT
$g.ReleaseHdc($hdc)
$bmp.Save($Out)
