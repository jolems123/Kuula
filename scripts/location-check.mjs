// Isolated browser regression tests. All account/API data and GPS fixes are synthetic.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:5175";
mkdirSync("artifacts/ui-review", { recursive: true });
const executablePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const applicationId = "11111111-1111-4111-8111-111111111111";
try {
  for (const width of [393, 1440]) for (const role of ["customer", "loan_officer"]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, geolocation: { latitude: 0, longitude: 32.5, accuracy: 15 }, permissions: ["geolocation"] });
    const user = { id: "location-test-user", role, initials: "LT", fullName: "Location Test User", email: "synthetic@example.com", phone: "+256770000001", nationalId: "CM900000000001", verified: true, dateOfBirth: "1990-01-01", memberSince: "2026-01-01" };
    let savedEvaluation;
    await context.addInitScript(() => sessionStorage.setItem("kuula_ephemeral_session_v2", JSON.stringify({ accessToken: "synthetic-token", refreshToken: "synthetic-refresh", accessExpiresAt: Date.now() + 900000 })));
    await context.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith("/api/")) return route.continue();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data = {};
      if (path === "/api/auth/me") data = { token: "synthetic-token", refreshToken: "synthetic-refresh", user, role, credit: null, loan: null, messages: [], unreadNotifications: 0 };
      if (path === "/api/operations/dashboard") data = { role, level: 1, counts: {}, queue: [{ id: applicationId, applicant_id: user.id, applicant_name: "Location Test Business", amount: 100000, purpose: "Working capital", status: "field_evaluation", updated_at: "2026-10-19" }] };
      if (path === "/api/operations/staff") data = { staff: [] };
      if (path === `/api/operations/applications/${applicationId}`) data = { application: { id: applicationId, applicantName: "Location Test Business", applicantId: user.id, amount: 100000, purpose: "Working capital", customer: {}, underwriting: {} }, case: { current_level: 1, status: "field_evaluation" }, evaluations: savedEvaluation ? [{ gps_latitude: savedEvaluation.gpsLatitude, gps_longitude: savedEvaluation.gpsLongitude }] : [], evidence: [], messages: [], events: [], actions: [], assignments: [] };
      if (path.endsWith("/evaluation")) { savedEvaluation = route.request().postDataJSON(); data = { ok: true }; }
      return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + (role === "customer" ? "/#/loan-apply" : "/#/admin-officer-dashboard"));
    if (role === "customer") {
      await page.getByRole("button", { name: "Use my current location", exact: true }).click();
      await page.getByText(/Pinned coordinates: 0.000000, 32.500000/).waitFor();
      assert.match(await page.locator("body").innerText(), /GPS accuracy ~15 m/);
      await page.getByLabel("Business latitude", { exact: true }).fill("0.3476");
      await page.getByLabel("Business longitude", { exact: true }).fill("32.5825");
      await page.getByRole("button", { name: "Place manual pin", exact: true }).click();
      await page.getByText(/Pinned coordinates: 0.347600, 32.582500/).waitFor();
      const map = page.getByRole("group", { name: "Choose business location on map" });
      await map.scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Zoom in map" }).click();
      await map.click({ position: { x: 90, y: 90 } });
      await page.waitForFunction(() => {
        const value = sessionStorage.getItem("kuula:loan-application-draft:v1:location-test-user");
        const business = value && JSON.parse(value).businessDetails;
        return business?.locationSource === "manual" && business.latitude !== 0.3476;
      });
      assert.equal(await page.locator("iframe").count(), 0);
      const tiles = page.locator('img[src^="https://tile.openstreetmap.org/"]');
      await page.waitForFunction(() => [...document.querySelectorAll('img[src^="https://tile.openstreetmap.org/"]')].some(img => img.complete && img.naturalWidth > 1), { timeout: 15000 });
      assert.ok(await tiles.count() <= 16);
      await map.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/ui-review/business-map-${width}.png` });
      await page.reload();
      await page.getByText(/Pinned coordinates:/).waitFor();
      await context.clearPermissions();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
      });
      await page.reload();
      await page.getByRole("button", { name: "Update my location", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: /Allow location/ }).waitFor();
    } else {
      await page.getByRole("button", { name: /Location Test Business/ }).click();
      await page.getByRole("button", { name: "Evaluation", exact: true }).click();
      await page.getByRole("button", { name: "Capture visit GPS", exact: true }).click();
      await page.getByText("GPS: 0.000000, 32.500000", { exact: true }).waitFor();
      await Promise.all([
        page.waitForResponse(response => response.url().endsWith("/evaluation") && response.request().method() === "POST"),
        page.getByRole("button", { name: "Save evaluation draft", exact: true }).click(),
      ]);
      assert.equal(savedEvaluation.gpsLatitude, 0);
      assert.equal(savedEvaluation.gpsLongitude, 32.5);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${role} GPS/map flow at ${width}px`);
  }
} finally { await browser.close(); }
