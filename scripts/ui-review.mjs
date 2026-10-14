/** Local UI regression review with synthetic sessions and API outage responses.
 * No live customer data or external API mutations are used.
 * Run with a local Vite preview: node scripts/ui-review.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const base = process.argv[2] || "http://127.0.0.1:5173";
const output = "artifacts/ui-review";
mkdirSync(output, { recursive: true });
const routes = [...readFileSync("src/app/screens/registry.ts", "utf8").matchAll(/^  "([^"]+)": \{ access: "([^"]+)"/gm)].map(m => ({ id: m[1], access: m[2] }));
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch(edge ? { executablePath: edge } : {});
const results = [];
const user = { id: "ui-review-user", initials: "UT", fullName: "UI Test Account", phone: "+256772000001", email: "ui-test@example.com", nationalId: "CM900000000001", dateOfBirth: "1990-01-01", district: "Kampala", occupation: "Trader", memberSince: "2026-01-01", verified: false, avatarUrl: null };
const session = role => ({ token: "synthetic-test-token", refreshToken: "synthetic-test-refresh-token", role, user: { ...user, role }, credit: { score: 500, maxScore: 850, tier: "Poor", percentile: 30 }, loan: { availableCredit: 0, creditIncreaseFromLastMonth: 0, totalLoansCount: 0, activeLoan: null, nextPayment: null }, messages: [], unreadNotifications: 0 });
try {
  for (const width of [393, 1440]) {
    for (const role of ["public", "customer", "super_admin"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      if (role !== "public") await context.addInitScript(() => {
        sessionStorage.setItem("kuula_ephemeral_session_v2", JSON.stringify({ accessToken: "synthetic-test-token", refreshToken: "synthetic-test-refresh-token", accessExpiresAt: Date.now() + 900000 }));
      });
      await context.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith("/api/")) return route.continue();
        const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        let data;
        if (path === "/api/auth/me") data = session(role);
        if (path === "/api/kyc/status") data = { kyc: { status: "not_started" } };
        if (path === "/api/staff" && role === "super_admin") data = { staff: [{ ...user, role: "loan_officer", phoneVerified: false, createdAt: "2026-01-01", deletedAt: null, status: "pending_approval" }] };
        return route.fulfill({ status: data ? 200 : 503, headers, contentType: "application/json", body: JSON.stringify(data || { error: "Service unavailable during UI resilience test" }) });
      });
      const page = await context.newPage();
      let current;
      console.log(`Reviewing ${role} at ${width}px`);
      page.on("pageerror", error => { results.push({ role, width, route: current, message: error.message, runtimeError: true }); console.error(`${role}/${current}: ${error.message}`); });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-screen]:not([data-screen="starting"])');
      const selected = routes.filter(r => role === "public" ? r.access === "public" && r.id !== "kyc" : role === "customer" ? r.access === "customer" || r.id === "kyc" : r.access === "admin");
      for (const { id } of selected) {
        current = id;
        await page.evaluate(id => { window.location.hash = "/" + id; }, id);
        await page.waitForTimeout(400);
        await page.waitForFunction(() => document.body.innerText.trim().length > 5, undefined, { timeout: 30000 }).catch(() => undefined);
        const text = (await page.innerText("body")).trim();
        const overflow = await page.evaluate(() => [...document.querySelectorAll("input,button,select,textarea")].filter(el => {
          if (el.closest(".kx-sidebar")) return false; // closed mobile drawer
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && (b.x > innerWidth || b.right < 0);
        }).map(el => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName));
        results.push({ role, width, route: id, renderedRoute: new URL(page.url()).hash, blank: text.length < 5, offscreenControls: overflow });
        if (text.length < 5) await page.screenshot({ path: `${output}/${role}-${width}-${id}-blank.png`, fullPage: true });
        if (["admin-login", "admin-activate", "home", "admin-dashboard", "admin-staff", "kyc"].includes(id)) await page.screenshot({ path: `${output}/${role}-${width}-${id}.png`, fullPage: true });
      }
      if (role === "customer") {
        current = "kyc-photo-removal";
        await page.goto(base + "/#/kyc");
        await page.locator("#kyc-nin").fill("CM900000000001");
        await page.locator("#kyc-name").fill("UI Test Account");
        await page.locator("#kyc-dob").fill("1990-01-01");
        await page.getByRole("button", { name: "Continue to photos" }).click();
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64");
        for (const kind of ["front", "back", "portrait"]) {
          await page.locator(`#kyc-photo-${kind}`).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
          const remove = page.locator("button").filter({ hasText: "Remove photo" });
          await remove.waitFor();
          await remove.click();
          assert.equal(await remove.count(), 0);
          assert.equal(await page.locator('img[alt$="preview"]').count(), 0);
        }
        await page.screenshot({ path: `${output}/customer-${width}-kyc-photos.png`, fullPage: true });
        await page.getByRole("button", { name: "Submit ID and portrait" }).click();
        assert.match(await page.innerText("body"), /Capture the front and back/);
      }
      if (role === "super_admin") {
        await page.goto(base + "/#/admin-staff");
        await page.waitForSelector('[data-screen="admin-staff"]');
        await page.getByRole("button", { name: "Add staff", exact: true }).click();
        await page.screenshot({ path: `${output}/super_admin-${width}-staff-form.png`, fullPage: true });
        assert.equal(await page.getByRole("button", { name: "Approve access" }).count(), 1);
        assert.equal(await page.getByText("Send SMS Invitation").count(), 0);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
}
const failures = results.filter(r => r.blank || r.runtimeError);
console.log(JSON.stringify({ screens: results.filter(r => r.route).length, failures, offscreen: results.filter(r => r.offscreenControls?.length) }, null, 2));
if (failures.length) process.exitCode = 1;
