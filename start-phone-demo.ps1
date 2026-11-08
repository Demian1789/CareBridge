$ErrorActionPreference = 'Stop'
$demoRoot = $PSScriptRoot
$runtimeDir = Join-Path $demoRoot '.runtime'
$tunnelExe = Join-Path $demoRoot '.local-tools/cloudflared.exe'
if (-not (Test-Path -LiteralPath $tunnelExe)) { throw 'cloudflared is missing. See the mobile deployment guide.' }
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$env:PORT = '18080'
$env:HOST = '127.0.0.1'
foreach ($kind in @('server', 'tunnel')) {
    $pidFile = Join-Path $runtimeDir "$kind.pid"
    if (Test-Path -LiteralPath $pidFile) {
        $existingId = [int](Get-Content -LiteralPath $pidFile -Raw)
        if (Get-Process -Id $existingId -ErrorAction SilentlyContinue) {
            throw "The demo $kind process is already running (PID $existingId)."
        }
    }
}
$pythonExe = (Get-Command python).Source
$serverProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-u', ('"' + (Join-Path $demoRoot 'server.py') + '"')) -WorkingDirectory $demoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log') -PassThru
Set-Content -LiteralPath (Join-Path $runtimeDir 'server.pid') -Value $serverProcess.Id
Start-Sleep -Seconds 1
if ($serverProcess.HasExited) { throw 'Server exited. Read .runtime/server.err.log.' }
$tunnelProcess = Start-Process -FilePath $tunnelExe -ArgumentList @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:18080') -WorkingDirectory $demoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.out.log') -RedirectStandardError (Join-Path $runtimeDir 'tunnel.err.log') -PassThru
Set-Content -LiteralPath (Join-Path $runtimeDir 'tunnel.pid') -Value $tunnelProcess.Id
Write-Output 'Demo started. The HTTPS URL will appear in .runtime/tunnel.err.log.'
Write-Output 'Open the HTTPS URL to enter CareBridge. Optional password protection is controlled by DEMO_PASSWORD in .env.'
