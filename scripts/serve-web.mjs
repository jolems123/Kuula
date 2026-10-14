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

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    contentSecurityPolicy,
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Photo capture is local to the device; third-party identity iframes are retired.
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
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
app.use((_req, res) => res.sendFile(path.join(distDir, "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`Kuula web listening on port ${port}`);
});
