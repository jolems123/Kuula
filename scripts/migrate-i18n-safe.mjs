#!/usr/bin/env node
/**
 * Safe i18n bootstrap — adds useTranslation import and hook to files that lack them.
 * Does NOT replace any strings (avoids all regex breakage).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const SCREENS_DIR = path.join(ROOT, "src/app/components/screens");

const files = fs.readdirSync(SCREENS_DIR).filter(f => f.endsWith(".tsx")).sort();
let modified = 0;

for (const file of files) {
  const fp = path.join(SCREENS_DIR, file);
  let code = fs.readFileSync(fp, "utf-8");
  
  if (code.includes("useTranslation")) continue; // Skip already converted
  
  const original = code;
  
  // Add import after existing imports
  if (!code.includes('from "react-i18next"')) {
    const lines = code.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("import ")) lastImportIdx = i;
    }
    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, 'import { useTranslation } from "react-i18next";');
      code = lines.join("\n");
    }
  }
  
  // Add hook inside the first exported function component
  if (!code.includes("useTranslation()")) {
    const lines = code.split("\n");
    let componentStart = -1;
    let inserted = false;
    
    for (let i = 0; i < lines.length && !inserted; i++) {
      if (lines[i].match(/export function \w+/) || lines[i].match(/export const \w+ = \(/) || lines[i].match(/function \w+\(/)) {
        componentStart = i;
        
        // Find the first line with useState, useAppContext, or const { in the function body
        for (let j = i + 1; j < Math.min(i + 20, lines.length) && !inserted; j++) {
          const trimmed = lines[j].trim();
          if (trimmed.startsWith("const {") || trimmed.startsWith("const [") || 
              trimmed.includes("useAppContext") || trimmed.includes("useState") ||
              trimmed.includes("useEffect") || trimmed.includes("useMemo") ||
              trimmed.includes("useCallback")) {
            // Insert after this line
            lines.splice(j + 1, 0, `  const { t } = useTranslation();`);
            code = lines.join("\n");
            inserted = true;
          }
        }
        
        // If no hooks found, insert after the opening brace
        if (!inserted) {
          for (let j = i + 1; j < Math.min(i + 5, lines.length) && !inserted; j++) {
            if (lines[j].includes("{") && !lines[j].includes("=>") && !lines[j].trimStart().startsWith("//")) {
              lines.splice(j + 1, 0, `  const { t } = useTranslation();`);
              code = lines.join("\n");
              inserted = true;
            }
          }
        }
      }
    }
    
    // If still not inserted (multi-component files), skip
    if (!inserted) {
      console.log(`  SKIP: ${file} (no component found)`);
      continue;
    }
  }
  
  if (code !== original) {
    fs.writeFileSync(fp, code);
    modified++;
    console.log(`  ✓ ${file}`);
  }
}

console.log(`\nModified ${modified} files (import + hook only, no string replacements)`);
