/**
 * Human-readable ID generators. All Kuula IDs are prefixed + zero-padded for
 * legibility — they show up in receipts, SMS, and admin UIs.
 */
import { randomBytes, randomInt } from "node:crypto";
import { query } from "../db/client.js";

const YEAR = new Date().getFullYear();

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

function shortRandom(len = 6): string {
  return randomBytes(len).toString("hex").slice(0, len).toUpperCase();
}

/** KUU-2026-000123 — customer ID. Allocates from a per-year sequence. */
export async function nextUserId(): Promise<string> {
  const { rows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM users WHERE id LIKE $1`,
    [`KUU-${YEAR}-%`],
  );
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `KUU-${YEAR}-${pad(n, 6)}`;
}

/** ADMIN-2026-000001 — staff ID. */
export async function nextAdminId(): Promise<string> {
  const { rows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM users WHERE id LIKE $1`,
    [`ADMIN-${YEAR}-%`],
  );
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `ADMIN-${YEAR}-${pad(n, 6)}`;
}

/** KUL-2026-00001 — loan application ID. */
export async function nextApplicationId(): Promise<string> {
  const { rows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM loan_applications WHERE id LIKE $1`,
    [`KUL-${YEAR}-%`],
  );
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `KUL-${YEAR}-${pad(n, 5)}`;
}

/** LN-{timestamp}-{short} — loan ID. */
export function nextLoanId(): string {
  return `LN-${Date.now()}-${shortRandom(4)}`;
}

/** DISB-{timestamp}-{short} — disbursement ID. */
export function nextDisbursementId(): string {
  return `DISB-${Date.now()}-${shortRandom(4)}`;
}

/** TX-{timestamp}-{short} — transaction ledger ID. */
export function nextTransactionId(): string {
  return `TX-${Date.now()}-${shortRandom(5)}`;
}

/** RCPT-{timestamp}-{short} — receipt ID. */
export function nextReceiptId(): string {
  return `RCPT-${Date.now()}-${shortRandom(4)}`;
}

/** MSG-{timestamp}-{short} — message ID. */
export function nextMessageId(): string {
  return `MSG-${Date.now()}-${shortRandom(6)}`;
}

/** NOTIF-{timestamp}-{short} — notification ID. */
export function nextNotificationId(): string {
  return `NOTIF-${Date.now()}-${shortRandom(5)}`;
}

/** GOAL-{timestamp}-{short} — savings goal ID. */
export function nextGoalId(): string {
  return `GOAL-${Date.now()}-${shortRandom(5)}`;
}

/** Generate a 6-digit numeric OTP code (zero-padded). Uses crypto for security. */
export function numericOtp(length = 6): string {
  const max = 10 ** length;
  return pad(randomInt(0, max), length);
}
