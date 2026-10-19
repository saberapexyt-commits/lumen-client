# Builds the Lumen in-game Fabric mod for one Minecraft version with the project-local JDK/Gradle (tools/, not committed).
#   powershell scripts/build-mod.ps1 [-Version 1.21.1]
# The mod version is taken from package.json, so the build number shown on the Lumen main menu matches the app.
# Output: resources/mods/lumen-client-mc<version>.jar
param([string]$Version = '1.21.1')
$root = Split-Path -Parent $PSScriptRoot
$jdkName = if ($Version -match '^(1\.20\.|1\.21\.[0-9]$)') { 'jdk21' } else { 'jdk25' }
$env:JAVA_HOME = (Get-ChildItem "$root\tools\$jdkName" -Directory | Select-Object -First 1).FullName
$env:GRADLE_USER_HOME = "$root\tools\gradle-home"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
$projectDir = Join-Path $root "mod\$Version"
Set-Location $projectDir
$appVersion = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
Remove-Item (Join-Path $projectDir 'build\libs\*.jar') -ErrorAction SilentlyContinue
$out = & (Join-Path $projectDir 'gradlew.bat') build --no-daemon "-Pmod_version=$appVersion" 2>&1
$ok = $LASTEXITCODE -eq 0
$out | Select-Object -Last 30
if (-not $ok) { Write-Output "MOD BUILD FAILED"; exit 1 }
$jar = Get-ChildItem (Join-Path $projectDir 'build\libs') -Filter "lumen-client-mc*.jar" | Where-Object { $_.Name -notmatch 'sources|dev' } | Select-Object -First 1
if ($jar) {
  New-Item -ItemType Directory -Force (Join-Path $root 'resources\mods') | Out-Null
  Copy-Item $jar.FullName (Join-Path $root "resources\mods\lumen-client-mc$Version.jar") -Force
  Write-Output "built $($jar.Name) -> resources/mods/lumen-client-mc$Version.jar"
}
