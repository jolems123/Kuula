import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const errors = [];
const requireFile = (file) => {
  if (!existsSync(file)) { errors.push(`Missing asset: ${file}`); return false; }
  return true;
};
const inventory = JSON.parse(readFileSync('assets/brand/inventory.json', 'utf8'));
for (const name of ['logo', 'icon']) {
  const source = inventory.canonical[name];
  if (!source) { errors.push(`Approved canonical ${name} not supplied`); continue; }
  if (requireFile(source.path)) {
    const hash = createHash('sha256').update(readFileSync(source.path)).digest('hex');
    if (hash !== source.sha256) errors.push(`Canonical ${name} hash changed`);
  }
}
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
for (const icon of manifest.icons) {
  const file = path.join('public', icon.src);
  if (requireFile(file)) {
    const png = readFileSync(file);
    if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') errors.push(`Invalid PNG: ${file}`);
    else if (`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` !== icon.sizes) errors.push(`Wrong icon dimensions: ${file}`);
  }
}
const html = readFileSync('index.html', 'utf8');
for (const [, ref] of html.matchAll(/href="(\.\/[^" ]+\.(?:png|webmanifest))"/g)) requireFile(path.join('public', ref));
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
    requireFile(`android/app/src/main/res/mipmap-${density}/${name}.png`);
  }
}
for (const folder of ['AppIcon.appiconset', 'Splash.imageset']) {
  const base = `ios/App/App/Assets.xcassets/${folder}`;
  const contents = JSON.parse(readFileSync(`${base}/Contents.json`, 'utf8'));
  for (const entry of contents.images) if (entry.filename) requireFile(`${base}/${entry.filename}`);
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const deprecated = new Set(inventory.deprecatedFilenames);
for (const file of [...walk('src').filter(f => /\.(tsx?|css)$/.test(f)), 'index.html', 'public/manifest.webmanifest']) {
  const source = readFileSync(file, 'utf8');
  for (const name of deprecated) if (source.includes(name)) errors.push(`Deprecated brand reference: ${file}: ${name}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Brand assets, hashes and platform references passed.');
