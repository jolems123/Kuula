import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asDataUrl = async file => `data:image/svg+xml;base64,${(await fs.readFile(file)).toString("base64")}`;
const iconUrl = await asDataUrl(path.join(root, "public", "kuula-icon.svg"));
const logoUrl = await asDataUrl(path.join(root, "public", "kuula-logo.svg"));
const windowsEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { executablePath: windowsEdge } : {}),
});
const page = await browser.newPage();

async function render(file, width, height, body, transparent = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{${transparent ? "background:transparent" : ""}}img{display:block}</style>${body}`);
  await page.screenshot({ path: file, omitBackground: transparent });
}

async function icon(file, size) {
  await render(file, size, size, `<img src="${iconUrl}" width="${size}" height="${size}" alt="">`);
}

async function logo(file, width, height) {
  await render(file, width, height, `<img src="${logoUrl}" width="${width}" height="${height}" alt="">`, true);
}

async function splash(file, width, height, dark = false) {
  const bg = dark ? "linear-gradient(160deg,#0B5E3A,#04351F)" : "linear-gradient(160deg,#0F7045,#064A2E)";
  const mark = Math.round(Math.min(width * .34, height * .19));
  const word = Math.round(Math.min(width * .52, 520));
  await render(file, width, height, `<main style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${bg};font-family:Arial,sans-serif;color:white"><img src="${iconUrl}" width="${mark}" height="${mark}" style="border-radius:${Math.round(mark*.22)}px;box-shadow:0 18px 48px rgba(0,0,0,.2)" alt=""><div style="font-size:${Math.round(word*.22)}px;font-weight:800;margin-top:${Math.round(mark*.18)}px;letter-spacing:-2px">Kuula</div><div style="font-size:${Math.round(word*.048)}px;font-weight:700;letter-spacing:4px;margin-top:10px">MICROFINANCE LIMITED</div><div style="font-size:${Math.round(word*.055)}px;margin-top:32px">Access <b style="color:#F2C94C">•</b> Grow <b style="color:#F2C94C">•</b> Prosper</div></main>`);
}

const publicDir = path.join(root, "public");
const assetsDir = path.join(root, "assets");
for (const [file, size] of [["kuula-icon-192.png",192],["kuula-icon-512.png",512],["kuula-icon-1024.png",1024],["favicon-256.png",256],["apple-touch-icon.png",180]]) await icon(path.join(publicDir, file), size);
await icon(path.join(publicDir, "kuula-tile-green-1024.png"), 1024);
await icon(path.join(root, "src", "imports", "kuula-icon-1024.png"), 1024);
for (const [file, size] of [["kuula-icon-512.png",512],["kuula-icon-1024.png",1024],["favicon-256.png",256]]) await icon(path.join(assetsDir, file), size);
for (const dir of [publicDir, assetsDir]) {
  await logo(path.join(dir, "kuula-logo-light.png"), 640, 760);
  await logo(path.join(dir, "kuula-logo-dark.png"), 640, 760);
  await splash(path.join(dir, "kuula-splash-cream.png"), 1080, 1920, false);
  await splash(path.join(dir, "kuula-splash-ink.png"), 1080, 1920, true);
  await splash(path.join(dir, "kuula-splash-coral.png"), 1080, 1920, false);
}

const android = path.join(root, "android", "app", "src", "main", "res");
for (const [folder, size] of Object.entries({ "mipmap-mdpi":48, "mipmap-hdpi":72, "mipmap-xhdpi":96, "mipmap-xxhdpi":144, "mipmap-xxxhdpi":192 })) {
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) await icon(path.join(android, folder, name), size);
}
for (const folder of (await fs.readdir(android)).filter(name => name.startsWith("drawable") && name !== "drawable-v24")) {
  const file = path.join(android, folder, "splash.png");
  try { await fs.access(file); } catch { continue; }
  const landscape = folder.includes("land");
  await splash(file, landscape ? 1920 : 1080, landscape ? 1080 : 1920, folder.includes("night"));
}

const iosIcons = path.join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
for (const name of (await fs.readdir(iosIcons)).filter(name => name.endsWith(".png"))) {
  const match = name.match(/AppIcon-(\d+)x/);
  await icon(path.join(iosIcons, name), match ? Number(match[1]) : 1024);
}
const iosSplash = path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
for (const name of (await fs.readdir(iosSplash)).filter(name => name.endsWith(".png"))) {
  const dark = name.includes("dark") || name.endsWith("-1.png");
  const size = name.includes("@1x") ? 2732 : name.includes("@2x") ? 1366 : name.includes("@3x") ? 911 : 2732;
  await splash(path.join(iosSplash, name), size, size, dark);
}

await browser.close();
console.log("Generated canonical Kuula web, Android, and iOS brand assets.");
