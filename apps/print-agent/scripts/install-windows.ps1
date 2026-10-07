param(
  [string]$ServerUrl,
  [Security.SecureString]$BridgeToken
)

$ErrorActionPreference = "Stop"

if (-not $ServerUrl) {
  $ServerUrl = Read-Host "KiJu-Serveradresse inklusive Basis-Pfad, zum Beispiel https://kiju-bi.de/gastro"
}
if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
  throw "Die Serveradresse darf nicht leer sein."
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodeMajorVersion = [int](& $nodeCommand.Source -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajorVersion -lt 20) {
  throw "Für die Druckbrücke wird Node.js 20 oder neuer benötigt."
}

$serverUri = [Uri]::new($ServerUrl.TrimEnd("/"))
$isLocalServer = @("localhost", "127.0.0.1", "::1") -contains $serverUri.Host
if (($serverUri.Scheme -ne "https" -and -not ($serverUri.Scheme -eq "http" -and $isLocalServer)) -or $serverUri.AbsolutePath.TrimEnd("/").EndsWith("/api")) {
  throw "Die Serveradresse muss HTTPS verwenden und darf keinen /api-Pfad enthalten."
}

$agentSource = Join-Path (Split-Path -Parent $PSScriptRoot) "dist\index.js"
if (-not (Test-Path -LiteralPath $agentSource -PathType Leaf)) {
  throw "Die fertige Druckbrücke fehlt. Zuerst muss das Paket @kiju/print-agent gebaut werden."
}

$installDirectory = Join-Path $env:LOCALAPPDATA "KiJu Gastro\Print Bridge"
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$icacls = Join-Path $env:SystemRoot "System32\icacls.exe"
& $icacls $installDirectory /reset /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Die vorhandenen Zugriffsrechte für den lokalen Schlüssel konnten nicht zurückgesetzt werden."
}
& $icacls $installDirectory /inheritance:r /grant:r `
  "*$currentSid`:(OI)(CI)(F)" `
  "*S-1-5-32-544:(OI)(CI)(F)" `
  "*S-1-5-18:(OI)(CI)(F)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Die Zugriffsrechte für den lokalen Schlüssel konnten nicht sicher gesetzt werden."
}

$agentPath = Join-Path $installDirectory "index.js"
$runnerSource = Join-Path $PSScriptRoot "run-windows.ps1"
$runnerPath = Join-Path $installDirectory "run-windows.ps1"
$disableSource = Join-Path $PSScriptRoot "disable-windows.ps1"
$disablePath = Join-Path $installDirectory "disable-windows.ps1"
$enableSource = Join-Path $PSScriptRoot "enable-windows.ps1"
$enablePath = Join-Path $installDirectory "enable-windows.ps1"
$configPath = Join-Path $installDirectory "config.json"
$stopMarkerPath = "$configPath.stop"
Copy-Item -LiteralPath $agentSource -Destination $agentPath -Force
Copy-Item -LiteralPath $runnerSource -Destination $runnerPath -Force
Copy-Item -LiteralPath $disableSource -Destination $disablePath -Force
Copy-Item -LiteralPath $enableSource -Destination $enablePath -Force
Remove-Item -LiteralPath $stopMarkerPath -Force -ErrorAction SilentlyContinue

$secureToken = $BridgeToken
if (-not $secureToken) {
  $secureToken = Read-Host "Druckbrückenschlüssel (64 zufällige Zeichen)" -AsSecureString
}
$tokenPointer = [IntPtr]::Zero
try {
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  if ($plainToken.Length -lt 64) {
    throw "Der Druckbrückenschlüssel muss mindestens 64 Zeichen lang sein."
  }

  $configuration = @{
    serverUrl = $ServerUrl.TrimEnd("/")
    token = $plainToken
    pollIntervalMs = 2000
    heartbeatIntervalMs = 15000
  } | ConvertTo-Json -Compress
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($configPath, $configuration, $utf8WithoutBom)
}
finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  $plainToken = $null
  $secureToken.Dispose()
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName = "KiJu Gastro Print Bridge"
$powerShellCommand = Get-Command powershell.exe -ErrorAction Stop
$action = New-ScheduledTaskAction `
  -Execute $powerShellCommand.Source `
  -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f $runnerPath, $nodeCommand.Source) `
  -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal `
  -UserId $identity `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Verbindet den lokalen KiJu-Bondrucker sicher mit der Online-Warteschlange." `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Die lokale Druckbrücke wurde eingerichtet und gestartet."
Write-Host "Sie startet künftig automatisch nach der Windows-Anmeldung dieses Benutzers."
Write-Host "Protokoll: $(Join-Path $installDirectory 'print-bridge.log')"
