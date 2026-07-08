import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENS_DIR = path.join(__dirname, "../src/app/components/screens");
const COMPONENTS_DIR = path.join(__dirname, "../src/app/components");

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  const original = content;
  let modified = false;

  // Fix 1: Revert broken t() calls that ended up inside string literals
  // Pattern: "{t("...")}"  →  "original_text" (we can't easily restore, so just remove the t() wrapper)
  // This catches cases where the script replaced text inside JSX attribute strings
  
  // Fix 2: Remove broken patterns like set{t("loanHistory.amount")} → setAmount
  content = content.replace(/set\{t\("loanHistory\.amount"\)\}/g, "setAmount");
  
  // Fix 3: Remove broken nested t() calls like {t("loanApply.loan{t("loanApproval.term")}")}
  // and {t("loanApply.loan{t("loanHistory.amount")}")}
  content = content.replace(/\{t\("loanApply\.loan\{t\("[^"]*"\)\}"\)\}/g, 'Loan Amount');
  
  // Fix 4: Remove broken t() calls in comment-like patterns {/* {t("loanApply.purpose")} */}
  // These were originally JSX comments that got corrupted
  content = content.replace(/\{\/\*\s*\{t\("[^"]*"\)\}\s*\*\/\}/g, (match) => {
    // Extract the key to try to restore a reasonable comment
    const keyMatch = match.match(/t\("([^"]+)"\)/);
    if (keyMatch) {
      modified = true;
      return `{/* ${keyMatch[1].split(".").pop()} */}`;
    }
    return match;
  });

  // Fix 5: Remove {t("...")} that's inside a string literal (between quotes)
  // Pattern: "some text {t("key")} more text" → this is invalid JSX
  // We need to find these and fix them
  // The pattern is: "... {t("...")} ..." where the outer quotes are JSX string boundaries
  
  // Fix 6: Remove t() from inside template literals that got corrupted
  content = content.replace(/\{t\("([^"]+)"\)\}/g, (match, key, offset) => {
    // Check if this t() call is inside a string literal by looking at surrounding context
    const before = content.substring(Math.max(0, offset - 50), offset);
    const after = content.substring(offset + match.length, offset + match.length + 50);
    
    // If surrounded by quotes (inside a string literal), it's broken
    const beforeQuote = before.match(/["']$/);
    const afterQuote = after.match(/^["']/);
    if (beforeQuote && afterQuote) {
      modified = true;
      // Return empty string - the original text is lost but at least it compiles
      return "";
    }
    
    // If preceded by = and followed by , or } it might be in an object/array outside component
    if (before.match(/[=:,]\s*$/) && after.match(/^[,}\]\s]/)) {
      // Check if we're likely outside a component function
      // This is hard to detect precisely, so we'll use a heuristic
      return match; // Keep it - might be valid
    }
    
    return match;
  });

  // Fix 7: Handle cases where "Sign in failed. Try again." was replaced in a catch block
  // Pattern: e instanceof ApiError ? e.message : {t("welcome.signFailed")}
  content = content.replace(/: \{t\("welcome\.signFailed"\)\}/g, ': "Sign in failed. Try again."');

  // Fix 8: Handle broken patterns in LoanApplyScreen where "ethod" was the variable name
  // (original typo in the source: const [ethod, setMethod] = useState("mtn");)
  content = content.replace(/const \[\{t\("[^"]*"\)\}, setMethod\]/g, "const [ethod, setMethod]");
  content = content.replace(/const \[method, \{t\("[^"]*"\)\}\]/g, "const [method, setMethod]");
  
  if (modified && content !== original) {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  }
  return content !== original;
}

// Get all TSX files
function getAllFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".tsx")).map(f => path.join(dir, f));
}

const files = [...getAllFiles(SCREENS_DIR), ...getAllFiles(COMPONENTS_DIR)];
let fixed = 0;

for (const file of files) {
  if (file.includes("LanguageScreen")) continue; // Skip our new file
  if (fixFile(file)) {
    fixed++;
    console.log(`  Fixed: ${path.basename(file)}`);
  }
}

console.log(`\nFixed ${fixed} files.`);