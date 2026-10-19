param([string]$TitlePrefix, [string]$Out)
# Saves a PNG of ONE window (never the whole desktop). Dev/test helper.
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public struct RECT { public int L, T, R, B; }
public static class U { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); }
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "$TitlePrefix*" } | Select-Object -First 1
if (-not $p) { Write-Error "window not found"; exit 1 }
$r = New-Object RECT
[void][U]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.R - $r.L; $h = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save($Out)
