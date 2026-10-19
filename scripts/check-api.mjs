// Public, read-only readiness checks. Never signs in, changes records or moves money.
const args = process.argv.slice(2);
const value = (key, fallback) => args[args.indexOf(key) + 1] && args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const api = new URL(value("--api", "https://api.kuulapp.com"));
const app = new URL(value("--app", "https://app.kuulapp.com"));
if (![api, app].every(url => ["http:", "https:"].includes(url.protocol) && !url.username && !url.password)) throw new Error("Use HTTP(S) URLs without credentials");
let failures = 0;
async function check(label, action) {
  try { await action(); console.log(`PASS  ${label}`); }
  catch (error) { failures++; console.error(`FAIL  ${label}: ${error.message}`); }
}
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
await check("API health", async () => {
  const response = await request(new URL("/api/health", api));
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`HTTP ${response.status}`);
  console.log(`      Real-money mode: ${body.realMoneyEnabled === true ? "enabled" : "disabled"}`);
});
await check("Database and schema readiness", async () => {
  const response = await request(new URL("/api/ready", api));
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`HTTP ${response.status}; inspect backend readiness logs`);
});
await check("App and API CORS connection", async () => {
  const response = await request(new URL("/api/auth/me", api), { method: "OPTIONS", headers: { Origin: app.origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" } });
  if (!response.ok || response.headers.get("access-control-allow-origin") !== app.origin) throw new Error(`App origin ${app.origin} is not allowed by API CORS`);
});
await check("App GPS and map security policies", async () => {
  const response = await request(app);
  if (!response.ok) throw new Error(`App HTTP ${response.status}`);
  const permissions = response.headers.get("permissions-policy") || "";
  const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname);
  if (!/geolocation=\(self\)/.test(permissions) && !(localPreview && !permissions)) throw new Error("App server must allow geolocation=(self)");
  const html = await response.text();
  const policies = [response.headers.get("content-security-policy"), html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1]].filter(Boolean);
  for (const policy of policies) {
    const images = policy.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1] || "";
    if (!images.split(/\s+/).includes("https://tile.openstreetmap.org")) throw new Error("A content security policy blocks OpenStreetMap images");
  }
  if (!policies.length) throw new Error("App security policy is missing");
});
if (args.includes("--maps")) await check("OpenStreetMap tile service", async () => {
  // A single public Kampala-area tile, not the user's private location.
  const response = await request("https://tile.openstreetmap.org/12/2418/2044.png", { headers: { Referer: app.origin + "/", "User-Agent": "Kuula-readiness-check/1.0 (+https://www.kuulapp.com)" } });
  if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) throw new Error(`Tile HTTP ${response.status}`);
  await response.arrayBuffer();
});
console.log("\nReadiness checks do not certify GPS hardware, SMS/email delivery, authenticated workflows or payment settlement.");
process.exitCode = failures ? 1 : 0;
