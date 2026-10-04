$ErrorActionPreference = "Stop"

$installDirectory = Join-Path $env:LOCALAPPDATA "KiJu Gastro\Print Bridge"
$configPath = Join-Path $installDirectory "config.json"
$stopMarkerPath = "$configPath.stop"
$pidPath = "$configPath.pid"
$taskName = "KiJu Gastro Print Bridge"

if (-not (Test-Path -LiteralPath $installDirectory -PathType Container)) {
  throw "Die lokale Druckbrücke wurde in diesem Windows-Profil nicht gefunden."
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
  $stopMarkerPath,
  "Die lokale Druckbrücke wurde manuell angehalten.",
  $utf8WithoutBom
)

$deadline = [DateTime]::UtcNow.AddSeconds(60)
$agentStopped = $false
while ([DateTime]::UtcNow -lt $deadline) {
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) {
    $agentStopped = $true
    break
  }

  $agentPid = 0
  $pidText = Get-Content -LiteralPath $pidPath -Raw -ErrorAction SilentlyContinue
  if ($null -eq $pidText) {
    Start-Sleep -Seconds 1
    continue
  }
  $pidText = $pidText.Trim()
  if (-not [int]::TryParse($pidText, [ref]$agentPid)) {
    Remove-Item -LiteralPath $pidPath -Force
    $agentStopped = $true
    break
  }

  $agentProcess = Get-Process -Id $agentPid -ErrorAction SilentlyContinue
  if (-not $agentProcess -or $agentProcess.ProcessName -ne "node") {
    Remove-Item -LiteralPath $pidPath -Force
    $agentStopped = $true
    break
  }
  Start-Sleep -Seconds 1
}

if ($agentStopped) {
  Write-Host "Die lokale Druckbrücke ist angehalten; ihr automatischer Start ist deaktiviert."
} else {
  Write-Warning "Der Agent beendet sich nach einem laufenden Vorgang. Die Stop-Markierung bleibt aktiv; der automatische Start ist deaktiviert."
}
Write-Host "Einstellungen und Protokolle bleiben erhalten unter: $installDirectory"
Write-Host "Zum Fortsetzen $installDirectory\enable-windows.ps1 ausführen."
