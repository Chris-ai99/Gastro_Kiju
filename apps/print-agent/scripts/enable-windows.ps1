$ErrorActionPreference = "Stop"

$installDirectory = Join-Path $env:LOCALAPPDATA "KiJu Gastro\Print Bridge"
$configPath = Join-Path $installDirectory "config.json"
$stopMarkerPath = "$configPath.stop"
$pidPath = "$configPath.pid"
$taskName = "KiJu Gastro Print Bridge"

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Die gespeicherte Druckbrückenkonfiguration wurde nicht gefunden."
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
  throw "Der automatische Start fehlt. Die Druckbrücke bitte erneut mit install-windows.ps1 einrichten."
}

if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
  $agentPid = 0
  $pidText = [System.IO.File]::ReadAllText($pidPath).Trim()
  if ([int]::TryParse($pidText, [ref]$agentPid)) {
    $agentProcess = Get-Process -Id $agentPid -ErrorAction SilentlyContinue
    if ($agentProcess -and $agentProcess.ProcessName -eq "node") {
      throw "Die Druckbrücke beendet noch einen laufenden Vorgang. Bitte kurz warten und das Skript erneut starten."
    }
  }
  Remove-Item -LiteralPath $pidPath -Force
}

Remove-Item -LiteralPath $stopMarkerPath -Force -ErrorAction SilentlyContinue
Enable-ScheduledTask -TaskName $taskName | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Die lokale Druckbrücke wurde fortgesetzt. Einstellungen und Protokolle wurden beibehalten."
