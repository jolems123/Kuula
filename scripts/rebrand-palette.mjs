// One-off migration from the retired coral identity to the approved
// emerald/gold Kuula brand kit.
// Run: node scripts/rebrand-palette.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MAP = [
  [/#ff6b35/gi, "#0B5E3A"],
  [/#f4612b/gi, "#0B5E3A"],
  [/#e05a2b/gi, "#064A2E"],
  [/#d9531f/gi, "#064A2E"],
  [/#10b981/gi, "#178654"],
  [/#12b984/gi, "#178654"],
  [/#fff0e8/gi, "#F3FAF7"],
  [/#fff6ef/gi, "#F3FAF7"],
  [/#ffdcc8/gi, "#DFF2E9"],
  [/#c4920a/gi, "#F2C94C"],
  [/rgba\(\s*255\s*,\s*107\s*,\s*53\s*,/gi, "rgba(11,94,58,"],
  [/rgba\(\s*244\s*,\s*97\s*,\s*43\s*,/gi, "rgba(11,94,58,"],
];

const EXT = new Set([".ts", ".tsx", ".html", ".json"]);
const targets = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXT.has(path.extname(entry.name))) targets.push(full);
  }
}

walk(path.join(root, "src"));
for (const f of ["index.html", "capacitor.config.ts"]) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) targets.push(p);
}

let changedFiles = 0;
let totalHits = 0;
const report = [];
for (const file of targets) {
  let text = fs.readFileSync(file, "utf8");
  let hits = 0;
  for (const [re, to] of MAP) {
    text = text.replace(re, () => { hits++; return to; });
  }
  if (hits > 0) {
    fs.writeFileSync(file, text);
    changedFiles++;
    totalHits += hits;
    report.push(`${hits}\t${path.relative(root, file)}`);
  }
}

fs.writeFileSync(path.join(root, "scripts", ".rebrand-report.txt"), report.join("\n") + "\n");
console.log(`rebrand: ${totalHits} replacements across ${changedFiles} files`);
