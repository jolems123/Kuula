import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 3000);
// Reuse the built policy, including its configured API origin. A second,
// hardcoded header would intersect with the meta policy and block that API.
const builtHtml = readFileSync(path.join(distDir, "index.html"), "utf8");
const builtPolicy = builtHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
if (!builtPolicy) throw new Error("The built app is missing its Content Security Policy. Rebuild before serving.");
const contentSecurityPolicy = `${builtPolicy}; frame-ancestors 'none'`;

// The public website (www.kuulapp.com) and the app (app.kuulapp.com) run on this one
// service; the Host header decides which is served. The website is plain pages built by
// scripts/build-site.mjs into dist/site/, with no scripts, so it gets its own policy.
const websiteHosts = new Set(
  (process.env.WEBSITE_HOSTS || "www.kuulapp.com,kuulapp.com").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
);
const siteDir = path.join(distDir, "site");
const websitePages = new Set(["business-loans", "how-it-works", "pricing", "eligibility", "about", "faq", "contact"]);
const websitePolicy = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; connect-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
const isWebsiteHost = (req) => websiteHosts.has(String(req.hostname || "").toLowerCase());

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    isWebsiteHost(req) ? websitePolicy : contentSecurityPolicy,
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Photo capture is local to the device; third-party identity iframes are retired.
  res.setHeader("Permissions-Policy", isWebsiteHost(req) ? "camera=(), microphone=(), geolocation=()" : "camera=(self), microphone=(), geolocation=(self)");
  next();
});
// Website pages on a website host: "/" and clean paths such as "/pricing". Older links
// to the single-page site and to ".html" paths redirect to the clean address.
const sendSitePage = (res, page, status = 200) => {
  res.status(status).setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(siteDir, `${page}.html`));
};
app.use((req, res, next) => {
  if (!isWebsiteHost(req) || (req.method !== "GET" && req.method !== "HEAD")) return next();
  const clean = req.path.replace(/\/+$/, "").replace(/\.html$/, "") || "/";
  if (clean === "/" || clean === "/index") return req.path === "/" ? sendSitePage(res, "index") : res.redirect(301, "/");
  if (clean === "/marketing") return res.redirect(301, "/");
  const page = clean.slice(1);
  if (websitePages.has(page)) return req.path === clean ? sendSitePage(res, page) : res.redirect(301, clean);
  return next();
});

app.use(express.static(distDir, {
  index: "index.html",
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "kuula-web" }));
app.use((req, res) => (isWebsiteHost(req) ? sendSitePage(res, "404", 404) : res.sendFile(path.join(distDir, "index.html"))));

app.listen(port, "0.0.0.0", () => {
  console.log(`Kuula web listening on port ${port}`);
});
