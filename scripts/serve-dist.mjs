#!/usr/bin/env node
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 8080);

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".webmanifest", "application/manifest+json"],
]);

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(), microphone=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; manifest-src 'self'; worker-src 'self' blob:"
  );
}

function safeFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  const normalized = path.posix.normalize(decoded).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("/../")) return null;
  const absolute = path.resolve(root, normalized || "index.html");
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

createServer(async (req, res) => {
  securityHeaders(res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  if (req.url === "/health" || req.url === "/health/") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  let file = safeFile(req.url || "/");
  if (!file) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  if (!(await exists(file))) file = path.join(root, "index.html");
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", MIME.get(ext) || "application/octet-stream");
  if (path.basename(file) === "index.html") {
    res.setHeader("Cache-Control", "no-store");
  } else if (file.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.end();
    return;
  }
  createReadStream(file)
    .on("error", () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end("Internal Server Error");
    })
    .pipe(res);
}).listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "web.started", port }));
});
