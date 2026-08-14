$ErrorActionPreference = "Stop"

function Assert-Status([string]$Name, [scriptblock]$Action) {
  try {
    & $Action
    Write-Host "PASS  $Name" -ForegroundColor Green
  } catch {
    Write-Host "FAIL  $Name" -ForegroundColor Red
    throw
  }
}

Write-Host "=== Kuula local smoke test ===" -ForegroundColor Cyan

Assert-Status "API health" {
  $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
  if (-not $health.ok) { throw "API health returned ok=false" }
  if ($health.realMoneyEnabled) { throw "Local API unexpectedly reports real money enabled" }
}

Assert-Status "Frontend reachable" {
  $web = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 5
  if ($web.StatusCode -ne 200) { throw "Frontend returned HTTP $($web.StatusCode)" }
}

$customer = $null
Assert-Status "Customer login" {
  $customer = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body '{"phone":"+256700000000","pin":"12345678"}'
  if (-not $customer.token) { throw "Customer token missing" }
}

Assert-Status "Customer session" {
  $me = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" -Headers @{ Authorization = "Bearer $($customer.token)" }
  if ($me.user.fullName -ne "Demo User") { throw "Unexpected demo user" }
}

Assert-Status "Credit network catalog" {
  $overview = Invoke-RestMethod -Uri "http://localhost:3000/api/network/overview?market=UG" -Headers @{ Authorization = "Bearer $($customer.token)" }
  if ($overview.market.code -ne "UG") { throw "Uganda market missing" }
  if ($overview.products.Count -lt 5) { throw "Expected at least five credit products" }
  if ($overview.partners.Count -lt 2) { throw "Expected TibaPay and SiliFi partner records" }
}

$challenge = $null
Assert-Status "Admin password challenge" {
  $challenge = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/admin-login" -Method Post -ContentType "application/json" -Body '{"email":"admin-local@kuula.test","password":"LocalAdminPassword2026!"}'
  if (-not $challenge.requiresMfa -or -not $challenge.challengeToken) { throw "Admin MFA challenge missing" }
}

$admin = $null
Assert-Status "Admin local MFA" {
  $body = @{ challengeToken = $challenge.challengeToken; code = "246810" } | ConvertTo-Json -Compress
  $admin = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/admin-login/verify" -Method Post -ContentType "application/json" -Body $body
  if (-not $admin.token) { throw "Admin token missing" }
}

Assert-Status "Credit operations dashboard" {
  $ops = Invoke-RestMethod -Uri "http://localhost:3000/api/operations/dashboard" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if (-not $ops.role) { throw "Operations dashboard did not return staff role" }
}

Assert-Status "Partner verification queue" {
  $queue = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/partner-financing" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if ($null -eq $queue.requests) { throw "Partner verification queue shape is invalid" }
}

Write-Host ""
Write-Host "KUULA LOCAL SMOKE TEST PASSED" -ForegroundColor Green
Write-Host "App: http://127.0.0.1:5173" -ForegroundColor White
Write-Host "API: http://localhost:3000/api/health" -ForegroundColor White
