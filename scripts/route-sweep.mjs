/**
 * Route sweep — drives the running app through every registered screen and
 * fails if any route throws a runtime error or renders blank.
 *
 * Requires a dev-mode server:
 *   npm run dev &
 *   node scripts/route-sweep.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";

const BASE = process.argv[2] ?? process.env.SWEEP_BASE_URL ?? "http://localhost:5173";

const CHROMIUM_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/home/z/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome",
];
const executablePath = CHROMIUM_CANDIDATES.find((path) => path && existsSync(path));

const ids = [...readFileSync("src/app/screens/registry.ts", "utf8").matchAll(/^  "([^"]+)":/gm)]
  .map((match) => match[1]);
if (ids.length < 100) {
  console.error(`registry parse failed: only ${ids.length} ids found`);
  process.exit(1);
}

const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();

const errors = {};
let current = "(startup)";
page.on("pageerror", (error) => {
  (errors[current] ??= []).push(String(error).slice(0, 200));
});
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  const isExpectedNetworkNoise =
    text.includes("ERR_CONNECTION_REFUSED") ||
    text.includes("Failed to load resource") ||
    text.includes("net::ERR_") ||
    text.includes("the server responded with a status of");
  if (isExpectedNetworkNoise) return;
  (errors[current] ??= []).push(`console.error: ${text.slice(0, 200)}`);
});

await page.addInitScript(() => {
  try { localStorage.setItem("kuula_onboarded", "1"); } catch { /* ignore */ }
});
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForURL(/#\/welcome$/, { timeout: 15_000 });

// Follow the public operator path exactly as the current UI exposes it.
await page.getByRole("button", { name: /^Admin$/i }).click();
const continueToAdmin = page.getByRole("button", { name: /Continue to Admin Login/i });
await continueToAdmin.waitFor({ state: "visible", timeout: 10_000 });
await continueToAdmin.click();
await page.waitForURL(/#\/admin-login$/, { timeout: 15_000 });

const emailInput = page.locator('input[type="email"]').first();
const passwordInput = page.locator('input[type="password"]').first();
await emailInput.waitFor({ state: "visible", timeout: 10_000 });
await emailInput.fill("admin@kuula.ug");
await passwordInput.fill("1234");

// The current button label is "Sign In to Admin". Match the complete label
// rather than relying on the older exact "Sign In" selector.
const submit = page.getByRole("button", { name: /Sign In to Admin/i });
await submit.waitFor({ state: "visible", timeout: 10_000 });
await submit.click();
await page.waitForURL(/#\/admin-dashboard$/, { timeout: 15_000 });

const blank = [];
for (const id of ids) {
  current = id;
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
