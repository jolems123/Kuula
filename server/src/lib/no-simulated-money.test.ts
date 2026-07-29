/**
 * C-07 / C-01 / C-02 regression guard.
 *
 * The original bug was not a subtle race — it was that the app credited and
 * debited a database column and called that "payment". These tests assert on
 * the source itself, so anyone reintroducing a simulated money movement fails
 * CI rather than shipping it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test" || entry === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = sourceFiles().map((f) => ({
  path: path.relative(SRC, f).replace(/\\/g, "/"),
  text: readFileSync(f, "utf8"),
}));

/**
 * Lines that write the field, ignoring lines that only read or filter on it.
 * `where: { status: "active" }` is a query; `data: { status: "active" }` is the
 * thing we are policing.
 */
function writeLines(text: string, pattern: RegExp): string[] {
  return text
    .split("\n")
    .filter((line) => pattern.test(line) && !/\bwhere\b/.test(line) && !/Number\(/.test(line));
}

describe("no simulated money movement", () => {
  it("no source file mutates a wallet balance", () => {
    // `wallets` is a deprecated simulation artefact (C-07). Reads are fine;
    // writes would mean the fake balance is live again.
    const offenders = files.filter(({ text }) =>
      /(prisma|tx)\s*\.\s*wallet\s*\.\s*(update|upsert|create|updateMany|createMany|delete)/.test(text)
    );

    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("only the settlement service writes repayments.amountPaid", () => {
    // A route or an admin tool writing amount_paid directly would bypass the
    // exactly-once settlement path entirely.
    // `amountPaid: BigInt(0)` is opening a new debt at zero, not applying money.
    const allowed = new Set(["lib/repayment.ts"]);
    const offenders = files.filter(
      ({ path: p, text }) =>
        !allowed.has(p) && writeLines(text, /amountPaid\s*:\s*BigInt\((?!0\))/).length > 0
    );

    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("only the settlement service marks a loan active", () => {
    // `active` means "the borrower has the money" and may only be set by a
    // verified provider callback (C-01).
    const allowed = new Set(["lib/disbursement.ts"]);
    const offenders = files.filter(
      ({ path: p, text }) => !allowed.has(p) && writeLines(text, /status:\s*["']active["']/).length > 0
    );

    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("no route writes a completed transaction directly", () => {
    const offenders = files.filter(
      ({ path: p, text }) =>
        p.startsWith("routes/") &&
        /type:\s*["'](loan_disbursement|loan_payment)["'][\s\S]{0,200}?status:\s*["']completed["']/.test(text)
    );

    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("no OTP value is written to a log line", () => {
    const offenders = files.filter(({ text }) =>
      /console\.(log|info|warn|error)\([^)]*\b(otpCode|otp_code|`\$\{code\}`|:\s*\$\{code\})/.test(text)
    );

    expect(offenders.map((o) => o.path)).toEqual([]);
  });

  it("the deprecated plaintext OTP columns are never written", () => {
    const offenders = files.filter(({ text }) => /otpCode\s*[,:]/.test(text));

    expect(offenders.map((o) => o.path)).toEqual([]);
  });
});
