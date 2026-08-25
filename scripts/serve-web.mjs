import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 3000);

const app = express();
app.disable("x-powered-by");
app.use(express.static(distDir, {
  index: "index.html",
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "kuula-web" }));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`Kuula web listening on port ${port}`);
});
