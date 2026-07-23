// One-off brand palette migration to the Kuula brand kit.
//   Kuula Coral  #F4612B  (was #FF6B35)
//   Coral Deep   #D9531F  (gradient partner, was #E05A2B)
//   Grow Mint    #12B984  (was #10B981 / accent gold #C4920A)
//   Cream        #FFF6EF  (was #FFF0E8)
// Run: node scripts/rebrand-palette.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MAP = [
  [/#ff6b35/gi, "#F4612B"],
  [/#e05a2b/gi, "#D9531F"],
  [/#10b981/gi, "#12B984"],
  [/#fff0e8/gi, "#FFF6EF"],
  [/#c4920a/gi, "#12B984"],
];

const EXT = new Set([".ts", ".tsx", ".css", ".html", ".json"]);
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
