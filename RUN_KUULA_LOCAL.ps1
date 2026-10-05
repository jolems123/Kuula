param(
  [switch]$SkipInstall,
  [switch]$NoBrowser,
  [switch]$NativePostgres
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $Root "server"
$ComposeFile = Join-Path $Root "deploy\docker-compose.local.yml"
$SmokeTest = Join-Path $Root "TEST_KUULA_LOCAL.ps1"

function Require-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is required. $Help" }
}

function Wait-Http([string]$Url, [int]$Attempts = 60) {
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 750
  }
  return $false
}

Write-Host ""
Write-Host "=== Kuula local launcher ===" -ForegroundColor Green
Write-Host "Real-money movement: DISABLED" -ForegroundColor Yellow
Write-Host ""

Require-Command "node" "Install Node.js 22 LTS and reopen PowerShell."
Require-Command "npm" "Install Node.js/npm and reopen PowerShell."
if (-not $NativePostgres) {
  Require-Command "docker" "Start Docker Desktop, or use -NativePostgres with an installed PostgreSQL."
}

Push-Location $Root
try {
  $databasePort = 5433
  if ($NativePostgres) {
    Require-Command "psql" "Add your PostgreSQL bin folder to PATH."
    $pgBin = Split-Path (Get-Command psql).Source
    $dataDirectory = Join-Path $Root ".tmp\postgres-local"
    $databasePort = 55433
    New-Item -ItemType Directory -Force (Join-Path $Root ".tmp") | Out-Null
    if (-not (Test-Path (Join-Path $dataDirectory "PG_VERSION"))) {
      $passwordFile = Join-Path $Root ".tmp\pg-init-password"
      try {
        Set-Content -LiteralPath $passwordFile -Value "kuula_local_password" -Encoding Ascii
        & (Join-Path $pgBin "initdb.exe") -D $dataDirectory -U kuula --auth=scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw "Could not initialize the isolated local PostgreSQL database." }
      } finally { Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue }
    }
    & (Join-Path $pgBin "pg_ctl.exe") -D $dataDirectory status *> $null
    if ($LASTEXITCODE -ne 0) {
      & (Join-Path $pgBin "pg_ctl.exe") -D $dataDirectory -l (Join-Path $Root ".tmp\postgres.log") -o "-p $databasePort -h 127.0.0.1" -w start
      if ($LASTEXITCODE -ne 0) { throw "Could not start local PostgreSQL. Check .tmp/postgres.log." }
    }
    $previousPgPassword = $env:PGPASSWORD
    try {
      $env:PGPASSWORD = "kuula_local_password"
      $exists = & (Join-Path $pgBin "psql.exe") -h 127.0.0.1 -p $databasePort -U kuula -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='kuula_local'"
      if ($LASTEXITCODE -ne 0) { throw "Local database connection failed." }
      if ($exists -ne "1") {
        & (Join-Path $pgBin "createdb.exe") -h 127.0.0.1 -p $databasePort -U kuula kuula_local
        if ($LASTEXITCODE -ne 0) { throw "Could not create kuula_local." }
      }
    } finally { $env:PGPASSWORD = $previousPgPassword }
  } else {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop or use -NativePostgres." }
    Write-Host "[1/9] Starting local PostgreSQL 16..." -ForegroundColor Cyan
    docker compose -f $ComposeFile up -d postgres
    if ($LASTEXITCODE -ne 0) { throw "Could not start the Kuula PostgreSQL container." }
    $dbReady = $false
    for ($i = 1; $i -le 40; $i++) {
      $status = docker inspect -f '{{.State.Health.Status}}' kuula-local-postgres 2>$null
      if ($status -eq "healthy") { $dbReady = $true; break }
      Start-Sleep -Seconds 1
    }
    if (-not $dbReady) { throw "PostgreSQL did not become healthy. Run: docker logs kuula-local-postgres" }
  }

  $env:NODE_ENV = "development"
  $env:REAL_MONEY_ENABLED = "false"
  $env:DATABASE_URL = "postgresql://kuula:kuula_local_password@127.0.0.1:${databasePort}/kuula_local?schema=public"
  $env:JWT_SECRET = "kuula-local-jwt-secret-2026-only-for-development-change-before-production-123456"
  $env:OTP_PEPPER = "kuula-local-otp-pepper-2026-only-for-development"
  $env:SMS_PROVIDER = "local"
  $env:ALLOW_LOCAL_DEV_OTP = "true"
  $env:LOCAL_DEV_OTP_CODE = "246810"
  $env:PORT = "3000"
  $env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000,http://127.0.0.1:5000"
  $env:PUBLIC_API_URL = "http://127.0.0.1:3000"
  $env:ADMIN_EMAIL = "admin-local@kuula.test"
  $env:ADMIN_PHONE = "+256700000001"
  $env:ADMIN_PASSWORD = "LocalAdminPassword2026!"
  $env:DEMO_PHONE = "+256700000000"
  $env:DEMO_PASSWORD = "12345678"

  $env:VITE_BACKEND = "node"
  $env:VITE_USE_API = "true"
  $env:VITE_API_BASE_URL = "http://127.0.0.1:3000"
  $env:VITE_APP_ENV = "development"
  $env:VITE_APP_VERSION = "local"
  $env:VITE_REVIEWER_MODE = "false"

  if (-not $SkipInstall) {
    Write-Host "[2/9] Installing frontend dependencies..." -ForegroundColor Cyan
    if (Test-Path (Join-Path $Root "package-lock.json")) { npm ci --legacy-peer-deps } else { npm install --legacy-peer-deps }
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }

    Write-Host "[3/9] Installing API dependencies..." -ForegroundColor Cyan
    Push-Location $Server
    try {
      npm install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw "API dependency installation failed." }
    } finally { Pop-Location }
  } else {
    Write-Host "[2-3/9] Dependency installation skipped." -ForegroundColor DarkGray
  }

  Write-Host "[4/9] Generating Prisma client, applying migrations and seeding local workflow..." -ForegroundColor Cyan
  Push-Location $Server
  try {
    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma client generation failed." }
    npm run db:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw "Database seed failed." }
    npm run db:seed:local
    if ($LASTEXITCODE -ne 0) { throw "Local workflow seed failed." }

    Write-Host "[5/9] Compiling API..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "API TypeScript build failed." }
  } finally { Pop-Location }

  Write-Host "[6/9] Validating and building frontend..." -ForegroundColor Cyan
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "Frontend TypeScript validation failed." }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

  foreach ($port in 3000, 5173) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) { throw "Port $port is already in use. Run STOP_KUULA_LOCAL.ps1 or stop the existing process, then launch Kuula again." }
  }

  Write-Host "[7/9] Launching Kuula API..." -ForegroundColor Cyan
  $backendCommand = @"
`$env:NODE_ENV='development';
`$env:REAL_MONEY_ENABLED='false';
`$env:DATABASE_URL='$env:DATABASE_URL';
`$env:JWT_SECRET='$env:JWT_SECRET';
`$env:OTP_PEPPER='$env:OTP_PEPPER';
`$env:SMS_PROVIDER='local';
`$env:ALLOW_LOCAL_DEV_OTP='true';
`$env:LOCAL_DEV_OTP_CODE='246810';
`$env:PORT='3000';
`$env:CORS_ORIGINS='$env:CORS_ORIGINS';
`$env:PUBLIC_API_URL='http://127.0.0.1:3000';
npm run dev
"@
  Start-Process powershell -WindowStyle Hidden -WorkingDirectory $Server -RedirectStandardOutput (Join-Path $Root "kuula-api.log") -RedirectStandardError (Join-Path $Root "kuula-api-error.log") -ArgumentList "-NoProfile", "-Command", $backendCommand | Out-Null
  if (-not (Wait-Http "http://127.0.0.1:3000/api/health" 60)) { throw "The API did not become healthy at http://127.0.0.1:3000/api/health. Check kuula-api-error.log for the exact error." }

  Write-Host "[8/9] Launching Kuula frontend..." -ForegroundColor Cyan
  $frontendCommand = @"
`$env:VITE_BACKEND='node';
`$env:VITE_USE_API='true';
`$env:VITE_API_BASE_URL='http://127.0.0.1:3000';
`$env:VITE_APP_ENV='development';
`$env:VITE_APP_VERSION='local';
`$env:VITE_REVIEWER_MODE='false';
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
"@
  Start-Process powershell -WindowStyle Hidden -WorkingDirectory $Root -RedirectStandardOutput (Join-Path $Root "kuula-web.log") -RedirectStandardError (Join-Path $Root "kuula-web-error.log") -ArgumentList "-NoProfile", "-Command", $frontendCommand | Out-Null
  if (-not (Wait-Http "http://127.0.0.1:5173" 60)) { throw "The frontend did not become reachable at http://127.0.0.1:5173. Check kuula-web-error.log for the exact error." }

  Write-Host "[9/9] Running authenticated local smoke test..." -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SmokeTest
  if ($LASTEXITCODE -ne 0) { throw "Kuula started but the authenticated local smoke test failed." }

  Write-Host ""
  Write-Host "KUULA IS RUNNING LOCALLY — SMOKE TEST PASSED" -ForegroundColor Green
  Write-Host "App:      http://127.0.0.1:5173" -ForegroundColor White
  Write-Host "API:      http://127.0.0.1:3000/api/health" -ForegroundColor White
  Write-Host "Database: 127.0.0.1:$databasePort / kuula_local" -ForegroundColor White
  Write-Host ""
  Write-Host "Customer demo" -ForegroundColor Cyan
  Write-Host "  Phone:    +256700000000"
  Write-Host "  Password: 12345678"
  Write-Host ""
  Write-Host "Level 1 field officer" -ForegroundColor Cyan
  Write-Host "  Email:    officer-local@kuula.test"
  Write-Host "  Password: LocalOfficerPassword2026!"
  Write-Host "  OTP:      246810"
  Write-Host ""
  Write-Host "Level 2 senior reviewer" -ForegroundColor Cyan
  Write-Host "  Email:    manager-local@kuula.test"
  Write-Host "  Password: LocalManagerPassword2026!"
  Write-Host "  OTP:      246810"
  Write-Host ""
  Write-Host "Level 3 / admin" -ForegroundColor Cyan
  Write-Host "  Email:    admin-local@kuula.test"
  Write-Host "  Password: LocalAdminPassword2026!"
  Write-Host "  OTP:      246810"
  Write-Host ""
  Write-Host "Local-only fake verified partner destinations (no real money):" -ForegroundColor Yellow
  Write-Host "  MTN:    +256700000010"
  Write-Host "  Airtel: +256700000011"
  Write-Host ""
  Write-Host "Partner verification workspace:" -ForegroundColor Cyan
  Write-Host "  http://127.0.0.1:5173/#/admin-partner-financing"
  Write-Host ""

  if (-not $NoBrowser) { Start-Process "http://127.0.0.1:5173" }
} finally {
  Pop-Location
}
