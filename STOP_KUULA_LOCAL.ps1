$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile = Join-Path $Root "deploy\docker-compose.local.yml"

Write-Host "Stopping Kuula local services..." -ForegroundColor Cyan

foreach ($port in 3000, 5173) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
      Write-Host "Stopping PID $($process.Id) on port $port ($($process.ProcessName))"
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

$nativeData = Join-Path $Root ".tmp\postgres-local"
if ((Test-Path (Join-Path $nativeData "PG_VERSION")) -and (Get-Command psql -ErrorAction SilentlyContinue)) {
  $pgBin = Split-Path (Get-Command psql).Source
  & (Join-Path $pgBin "pg_ctl.exe") -D $nativeData -m fast -w stop | Out-Host
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose -f $ComposeFile stop postgres | Out-Host
}

Write-Host "Kuula local app/API stopped. PostgreSQL data volume was preserved." -ForegroundColor Green
Write-Host "To remove the local database as well, run:" -ForegroundColor DarkGray
Write-Host "  docker compose -f deploy/docker-compose.local.yml down -v" -ForegroundColor DarkGray
