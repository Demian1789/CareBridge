$ErrorActionPreference = 'Stop'
foreach ($kind in @('tunnel', 'server')) {
    $pidFile = Join-Path $PSScriptRoot ".runtime/$kind.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $demoProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $demoProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $demoProcessId"
    if (-not $demoProcess) { continue }
    $expected = if ($kind -eq 'server') { Join-Path $PSScriptRoot 'server.py' } else { Join-Path $PSScriptRoot '.local-tools/cloudflared.exe' }
    $matches = if ($kind -eq 'server') { $demoProcess.CommandLine -and $demoProcess.CommandLine.Contains($expected) } else { $demoProcess.ExecutablePath -eq $expected }
    if (-not $matches) { throw "PID $demoProcessId does not belong to this demo; leaving it running." }
    Stop-Process -Id $demoProcessId
    Write-Output "Stopped demo $kind (PID $demoProcessId)."
}
