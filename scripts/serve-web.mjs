import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 3000);

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdn.usesmileid.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.kuulapp.com https://o1154186.ingest.us.sentry.io; media-src 'self' blob:; worker-src 'self' blob:; frame-src https://cdn.usesmileid.com; manifest-src 'self'; upgrade-insecure-requests",
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Identity verification runs in Smile ID's hosted frame, which needs the camera.
  res.setHeader("Permissions-Policy", 'camera=(self "https://cdn.usesmileid.com"), microphone=(), geolocation=()');
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
