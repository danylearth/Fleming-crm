param([ValidateSet('start', 'stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
$pgCtl = Join-Path $localRoot 'tools\pgsql\bin\pg_ctl.exe'
$pgData = Join-Path $localRoot 'pgdata'
$stateFile = Join-Path $localRoot 'processes.json'
$services = @(
    @{ Name = 'backend'; Entry = (Join-Path $projectRoot 'backend\dist\index-pg.js'); Arguments = '--env-file=.env'; Port = 3001 },
    @{ Name = 'frontend'; Entry = (Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'); Arguments = ''; Port = 5173 }
)
$state = @{}
if (Test-Path -LiteralPath $stateFile) {
    $saved = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    foreach ($item in $saved.PSObject.Properties) { $state[$item.Name] = $item.Value }
}
function Get-DemoProcess($service) {
    if (-not $state.ContainsKey($service.Name)) { return $null }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($state[$service.Name])"
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($service.Entry)) { return $process }
    return $null
}
if ($Action -eq 'stop') {
    foreach ($service in $services) {
        $process = Get-DemoProcess $service
        if ($process) { Stop-Process -Id $process.ProcessId }
    }
    & $pgCtl -D $pgData status *> $null
    if ($LASTEXITCODE -eq 0) {
        & $pgCtl -D $pgData -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the local database.' }
    }
    '{}' | Set-Content -LiteralPath $stateFile
    Write-Host 'CRM stopped. Your demo records are saved.'
    exit 0
}
$env:PATH = (Join-Path $localRoot 'tools\poppler-26.09.0\Library\bin') + ';' + $env:PATH
$gitUtilities = Join-Path $env:ProgramFiles 'Git\usr\bin'
if (Test-Path (Join-Path $gitUtilities 'unzip.exe')) { $env:PATH = $gitUtilities + ';' + $env:PATH }
$node = (Get-Command node.exe).Source
& $pgCtl -D $pgData status *> $null
if ($LASTEXITCODE -ne 0) {
    & $pgCtl -D $pgData -l (Join-Path $localRoot 'postgres.log') -w start
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the local database.' }
}
foreach ($service in $services) {
    if (Get-DemoProcess $service) { continue }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $($service.Port) is already used by another process. Stop it before starting the CRM." }
    $arguments = if ($service.Name -eq 'backend') {
        @('--env-file=.env', ('"' + $service.Entry + '"'))
    } else {
        @(('"' + $service.Entry + '"'), '--host', '127.0.0.1', '--port', '5173', '--strictPort')
    }
    $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory (Join-Path $projectRoot $service.Name) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot ($service.Name + '.log')) -RedirectStandardError (Join-Path $localRoot ($service.Name + '-error.log'))
    $state[$service.Name] = $process.Id
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile
}
foreach ($url in @('http://127.0.0.1:3001/api/health', 'http://127.0.0.1:5173')) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw "Startup failed at $url. See the logs in $localRoot." }
}
Write-Host 'CRM is ready: http://localhost:5173'
Write-Host ('Login details: ' + (Join-Path $localRoot 'login.txt'))
