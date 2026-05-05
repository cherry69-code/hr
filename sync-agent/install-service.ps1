$ErrorActionPreference = 'Stop'

$agentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nssm = Join-Path $agentRoot 'nssm.exe'

if (-not (Test-Path $nssm)) {
  Write-Error "Place nssm.exe inside $agentRoot before running this script."
}

$serviceName = 'PropHRSyncAgent'
$nodeExe = (Get-Command node).Source
$agentScript = Join-Path $agentRoot 'agent.js'
$stdoutLog = Join-Path $agentRoot 'logs\\service-out.log'
$stderrLog = Join-Path $agentRoot 'logs\\service-err.log'

New-Item -ItemType Directory -Force -Path (Join-Path $agentRoot 'logs') | Out-Null

& $nssm install $serviceName $nodeExe $agentScript
& $nssm set $serviceName AppDirectory $agentRoot
& $nssm set $serviceName AppStdout $stdoutLog
& $nssm set $serviceName AppStderr $stderrLog
& $nssm set $serviceName AppRotateFiles 1
& $nssm set $serviceName Start SERVICE_AUTO_START
& $nssm start $serviceName

Write-Host "Installed and started service: $serviceName"
