# Builds the Lumen in-game Fabric mod with the project-local JDK/Gradle (see tools/, not committed).
# Output: mod/build/libs/lumen-client-mc<version>-<modversion>.jar  -> copied to resources/mods/
$root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = (Get-ChildItem "$root\tools\jdk" -Directory | Select-Object -First 1).FullName
$env:GRADLE_USER_HOME = "$root\tools\gradle-home"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
Set-Location "$root\mod"
& "$root\mod\gradlew.bat" build --no-daemon 2>&1 | Select-Object -Last 30
$jar = Get-ChildItem "$root\mod\build\libs" -Filter "lumen-client-mc*.jar" | Where-Object { $_.Name -notmatch 'sources|dev' } | Select-Object -First 1
if ($jar) {
  New-Item -ItemType Directory -Force "$root\resources\mods" | Out-Null
  $mc = ($jar.Name -replace '^lumen-client-mc([\d.]+)-.*$', '$1')
  Copy-Item $jar.FullName "$root\resources\mods\lumen-client-mc$mc.jar" -Force
  Write-Output "built $($jar.Name) -> resources/mods/lumen-client-mc$mc.jar"
}
