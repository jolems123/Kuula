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

function Login-Staff([string]$Email, [string]$Password) {
  $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
  $challenge = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/admin-login" -Method Post -ContentType "application/json" -Body $loginBody
  if (-not $challenge.requiresMfa -or -not $challenge.challengeToken) { throw "Staff MFA challenge missing for $Email" }
  $verifyBody = @{ challengeToken = $challenge.challengeToken; code = "246810" } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri "http://localhost:3000/api/auth/admin-login/verify" -Method Post -ContentType "application/json" -Body $verifyBody
}

function Expect-HttpStatus([int]$Expected, [scriptblock]$Action) {
  try {
    & $Action | Out-Null
    throw "Expected HTTP $Expected but the request succeeded"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -ne $Expected) { throw "Expected HTTP $Expected but received HTTP $status" }
  }
}

Write-Host "=== Kuula local smoke test ===" -ForegroundColor Cyan

Assert-Status "API health" {
  $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
  if (-not $health.ok) { throw "API health returned ok=false" }
}

Assert-Status "API database readiness" {
  $ready = Invoke-RestMethod -Uri "http://localhost:3000/api/ready" -Method Get
  if (-not $ready.ok -or $ready.database -ne "ready") { throw "API/PostgreSQL readiness failed" }
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

$admin = $null
Assert-Status "Level 3 admin MFA" {
  $admin = Login-Staff "admin-local@kuula.test" "LocalAdminPassword2026!"
  if (-not $admin.token -or $admin.role -ne "admin") { throw "Admin session missing" }
}

$officer = $null
Assert-Status "Level 1 officer MFA" {
  $officer = Login-Staff "officer-local@kuula.test" "LocalOfficerPassword2026!"
  if (-not $officer.token -or $officer.role -ne "officer") { throw "Officer session missing" }
}

$manager = $null
Assert-Status "Level 2 manager MFA" {
  $manager = Login-Staff "manager-local@kuula.test" "LocalManagerPassword2026!"
  if (-not $manager.token -or $manager.role -ne "manager") { throw "Manager session missing" }
}

Assert-Status "Credit operations dashboard" {
  $ops = Invoke-RestMethod -Uri "http://localhost:3000/api/operations/dashboard" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if (-not $ops.role) { throw "Operations dashboard did not return staff role" }
}

Assert-Status "Level 1 field officer seeded" {
  $staff = Invoke-RestMethod -Uri "http://localhost:3000/api/operations/staff?role=officer" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if ($staff.staff.Count -lt 1) { throw "No field officer is available for assignment" }
}

Assert-Status "Level 2 senior reviewer seeded" {
  $staff = Invoke-RestMethod -Uri "http://localhost:3000/api/operations/staff?role=manager" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if ($staff.staff.Count -lt 1) { throw "No senior reviewer is available for Level 2" }
}

Assert-Status "Officer cannot access global KYC queue" {
  Expect-HttpStatus 403 {
    Invoke-WebRequest -Uri "http://localhost:3000/api/admin/kyc/queue" -Headers @{ Authorization = "Bearer $($officer.token)" } -UseBasicParsing
  }
}

Assert-Status "Manager cannot access treasury reconciliation" {
  Expect-HttpStatus 403 {
    Invoke-WebRequest -Uri "http://localhost:3000/api/admin/reconciliation" -Headers @{ Authorization = "Bearer $($manager.token)" } -UseBasicParsing
  }
}

Assert-Status "Manager cannot create payment destinations" {
  Expect-HttpStatus 403 {
    $payload = '{"marketCode":"UG","provider":"marzpay","network":"mtn","beneficiaryType":"partner","beneficiaryReference":"+256700000099","maxSingleAmount":1000000,"sourceNote":"Smoke test must not reach destination creation"}'
    Invoke-WebRequest -Uri "http://localhost:3000/api/admin/payment-provider-limits/destinations" -Method Post -Headers @{ Authorization = "Bearer $($manager.token)" } -ContentType "application/json" -Body $payload -UseBasicParsing
  }
}

Assert-Status "Partner verification queue" {
  $queue = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/partner-financing" -Headers @{ Authorization = "Bearer $($admin.token)" }
  if ($null -eq $queue.requests) { throw "Partner verification queue shape is invalid" }
}

Write-Host ""
Write-Host "KUULA LOCAL SMOKE TEST PASSED" -ForegroundColor Green
Write-Host "App: http://127.0.0.1:5173" -ForegroundColor White
Write-Host "API: http://localhost:3000/api/ready" -ForegroundColor White
