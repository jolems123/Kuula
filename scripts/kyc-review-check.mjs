// Test the KYC approval controls with synthetic data; never approve real customers.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:5173";
const output = "artifacts/ui-review";
mkdirSync(output, { recursive: true });
const executablePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const width of [393, 1440]) {
    let submissions = [{ id: "synthetic-kyc", fullName: "Review Test Customer", nationalId: "CM900000000001", dateOfBirth: "1990-01-01", provider: "kuula-manual", providerStatus: "manual_review", status: "pending", hasFront: true, hasBack: true, hasPortrait: true }];
    const decisions = [];
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => sessionStorage.setItem("kuula_ephemeral_session_v2", JSON.stringify({ accessToken: "synthetic-token", refreshToken: "synthetic-refresh", accessExpiresAt: Date.now() + 900000 })));
    await context.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith("/api/")) return route.continue();
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data;
      if (path === "/api/auth/me") data = { token: "synthetic-token", refreshToken: "synthetic-refresh", role: "super_admin", user: { id: "synthetic-admin", role: "super_admin", initials: "SA", fullName: "Super Admin", email: "synthetic@example.com", memberSince: "2026-01-01" }, credit: null, loan: null, messages: [], unreadNotifications: 0 };
      if (path === "/api/admin/kyc/queue") data = { submissions };
      if (path.includes("/preview/")) data = { dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=" };
      if (path.endsWith("/decision")) { decisions.push(route.request().postDataJSON()); submissions = []; data = { ok: true }; }
      return route.fulfill({ status: data ? 200 : 503, headers, contentType: "application/json", body: JSON.stringify(data || { error: "Synthetic unavailable service" }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/#/admin-customer-kyc`);
    await page.getByRole("button", { name: /Review Test Customer/ }).click();
    const approve = page.getByRole("button", { name: "Approve customer identity", exact: true });
    assert.equal(await approve.isEnabled(), true);
    await approve.click();
    assert.match(await page.getByRole("alert").innerText(), /decision notes/);
    assert.equal(decisions.length, 0);
    await page.getByLabel("Review decision notes").fill("Synthetic review notes for testing only.");
    await approve.click();
    assert.match(await page.getByRole("alert").innerText(), /all three photographs/);
    assert.equal(decisions.length, 0);
    await page.getByRole("button", { name: "Review ID and portrait photographs" }).click();
    await page.getByAltText("Applicant portrait photograph").waitFor();
    await approve.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/kyc-approval-${width}.png`, fullPage: true });
    const sizes = await page.locator(".kx-kyc-decision-actions button").evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { height: r.height, left: r.left, right: r.right }; }));
    assert.ok(sizes.every(size => size.height >= 52 && size.left >= 0 && size.right <= width));
    await approve.click();
    await page.getByRole("status").filter({ hasText: "Customer identity approved successfully." }).waitFor();
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decision, "verified");
    assert.equal(decisions[0].reason, "Synthetic review notes for testing only.");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS: Super Admin approval, review requirements and button layout at ${width}px`);
  }
} finally { await browser.close(); }
