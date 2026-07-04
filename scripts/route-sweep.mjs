/**
 * Route sweep — drives the running app through every registered screen and
 * fails if any route throws a runtime error or renders blank.
 *
 * Requires a dev-mode server (demo login enabled):
 *   npm run dev &        # or CI equivalent
 *   node scripts/route-sweep.mjs [baseUrl]
 *
 * Works with the app's HashRouter (file://-safe for Capacitor): navigation
 * is performed by setting `window.location.hash`, which fires the same
 * `hashchange` event the router listens for.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";

const BASE = process.argv[2] ?? process.env.SWEEP_BASE_URL ?? "http://localhost:5173";

// Playwright's `chromium.launch()` defaults to the headless_shell build, which
// isn't always downloaded in CI/sandboxed environments. Fall back to any full
// Chromium build that's already on disk so the sweep can run anywhere.
const CHROMIUM_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/home/z/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
];
const executablePath = CHROMIUM_CANDIDATES.find((p) => p && existsSync(p));

const ids = [...readFileSync("src/app/screens/registry.ts", "utf8").matchAll(/^  "([^"]+)":/gm)]
  .map((m) => m[1]);
if (ids.length < 100) {
  console.error(`registry parse failed: only ${ids.length} ids found`);
  process.exit(1);
}

const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();

const errors = {};
let current = "(startup)";
page.on("pageerror", (e) => {
  (errors[current] ??= []).push(String(e).slice(0, 200));
});
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  // Browser-level network failures (no backend running) are expected in the
  // sweep environment — the screens already handle them gracefully via
  // try/catch fallbacks. Same for the autoplay/Vite HMR noise. Counting
  // these as failures would create false positives.
  const isExpectedNetworkNoise =
    text.includes("ERR_CONNECTION_REFUSED") ||
    text.includes("Failed to load resource") ||
    text.includes("net::ERR_") ||
    text.includes("the server responded with a status of");
  if (isExpectedNetworkNoise) return;
  (errors[current] ??= []).push(`console.error: ${text.slice(0, 200)}`);
});

// Land on the app. With HashRouter, the root URL redirects to #/welcome.
// Pre-mark first-launch onboarding as seen so the sweep starts at welcome.
await page.addInitScript(() => {
  try { localStorage.setItem("kuula_onboarded", "1"); } catch { /* ignore */ }
});
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForURL(/#\/welcome$/, { timeout: 15_000 });

// Log in via the demo admin account — an authenticated admin session passes
// every route guard.
await page.getByRole("button", { name: /ADMIN/i }).click();
await page.getByPlaceholder("Enter your PIN").fill("1234");
await page.getByRole("button", { name: "Log In", exact: true }).click();
await page.waitForURL(/#\/admin-dashboard$/, { timeout: 15_000 });

const blank = [];
for (const id of ids) {
  current = id;
  // SPA navigation via hashchange keeps the in-memory session alive.
  await page.evaluate((path) => {
    window.location.hash = path;
  }, "/" + id);
  await page.waitForTimeout(250);
  const text = (await page.innerText("body")).trim();
  if (text.length < 5) blank.push(id);
}
await browser.close();

console.log(`routes swept: ${ids.length}`);
const failed = Object.keys(errors);
for (const id of failed) console.error(`  X ${id} -> ${errors[id][0]}`);
for (const id of blank) console.error(`  X ${id} -> rendered blank`);

if (failed.length || blank.length) {
  console.error(`FAIL: ${failed.length} route(s) with errors, ${blank.length} blank`);
  process.exit(1);
}
console.log("PASS: no runtime errors, no blank screens");
