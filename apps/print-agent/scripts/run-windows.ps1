param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$ErrorActionPreference = "Stop"
$agentPath = Join-Path $PSScriptRoot "index.js"
$process = Start-Process `
  -FilePath $NodePath `
  -ArgumentList ('"{0}"' -f $agentPath) `
  -WorkingDirectory $PSScriptRoot `
  -WindowStyle Hidden `
  -Wait `
  -PassThru
exit $process.ExitCode
