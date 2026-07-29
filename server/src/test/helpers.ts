/**
 * Shared test fixtures.
 *
 * The payment provider is stubbed at the HTTP boundary only (`global.fetch`),
 * so every layer under test — route, service, lock, constraint — is the real
 * production code path.
 */
import { vi } from "vitest";
import crypto from "crypto";
import prisma from "../lib/prisma.js";

export { prisma };

/** Truncate every table between tests. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_events", "webhook_events", "otp_challenges", "refresh_tokens",
      "transactions", "repayments", "loan_applications", "notifications",
      "savings_goals", "messages", "wallets", "savings_accounts", "users"
    RESTART IDENTITY CASCADE
  `);
}

export interface FakeUser {
  id: string;
  phone: string;
}

let phoneCounter = 0;

export async function createUser(overrides: Partial<{ phone: string; role: string; fullName: string }> = {}): Promise<FakeUser> {
  // Valid Ugandan MTN range so disbursement's recipient validation passes.
  phoneCounter += 1;
  const phone = overrides.phone ?? `+25677${String(1000000 + phoneCounter).slice(-7)}`;
  const user = await prisma.user.create({
    data: {
      fullName: overrides.fullName ?? "Test Borrower",
      phone,
      role: overrides.role ?? "user",
      passwordHash: "$2a$04$abcdefghijklmnopqrstuv",
      phoneVerified: true,
      savingsAccount: { create: { balance: 0 } },
    },
  });
  return { id: user.id, phone };
}

export async function createOfferedLoan(
  userId: string,
  opts: { amount?: number; total?: number; termDays?: number } = {}
) {
  const amount = opts.amount ?? 500_000;
  const total = opts.total ?? Math.round(amount * 1.15);
  return prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: "Test Borrower",
      amount: BigInt(amount),
      total: BigInt(total),
      interest: BigInt(total - amount),
      termDays: opts.termDays ?? 90,
      status: "offered",
      decidedAt: new Date(),
    },
  });
}

/** A disbursed loan with a scheduled repayment, as the webhook would leave it. */
export async function createActiveLoanWithRepayment(
  userId: string,
  opts: { amount?: number; total?: number } = {}
) {
  const amount = opts.amount ?? 500_000;
  const total = opts.total ?? 600_000;
  const app = await prisma.loanApplication.create({
    data: {
      applicantId: userId,
      applicantName: "Test Borrower",
      amount: BigInt(amount),
      total: BigInt(total),
      termDays: 90,
      status: "active",
      disbursedAt: new Date(),
      decidedAt: new Date(),
      loanId: crypto.randomUUID(),
    },
  });
  const repayment = await prisma.repayment.create({
    data: {
      userId,
      loanId: app.loanId!,
      total: BigInt(total),
      amountPaid: BigInt(0),
      dueDate: new Date(Date.now() + 90 * 86_400_000),
      status: "scheduled",
      attempts: [],
    },
  });
  return { app, repayment };
}

// ── Payment provider stub ──────────────────────────────────────────────────

export interface ProviderCall {
  url: string;
  body: Record<string, unknown>;
}

export interface ProviderStub {
  calls: ProviderCall[];
  /** Force the next N provider calls to behave a particular way. */
  mode: "accept" | "reject" | "timeout" | "server-error";
  /** Status returned by the transaction-status endpoint. */
  statusResponse: { status: string; amount?: number | null };
  restore: () => void;
}

/**
 * Replace `fetch` with a MarzPay double.
 *
 * This is the ONLY thing stubbed. Everything below it — the ledger writes, the
 * locks, the constraints — is the real implementation running against real
 * Postgres.
 */
export function stubProvider(): ProviderStub {
  const original = globalThis.fetch;
  const stub: ProviderStub = {
    calls: [],
    mode: "accept",
    statusResponse: { status: "successful" },
    restore: () => {
      globalThis.fetch = original;
    },
  };

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (/\/transactions\//.test(url)) {
      return new Response(
        JSON.stringify({ data: { transaction: { status: stub.statusResponse.status, amount: stub.statusResponse.amount } } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    stub.calls.push({ url, body });

    if (stub.mode === "timeout") {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    if (stub.mode === "server-error") {
      return new Response(JSON.stringify({ success: false, message: "upstream unavailable" }), { status: 503 });
    }
    if (stub.mode === "reject") {
      return new Response(
        JSON.stringify({ success: false, message: "insufficient float" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { transaction: { uuid: `prov-${crypto.randomUUID()}`, status: "pending" } },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;

  return stub;
}

/** Sign a webhook body exactly as MarzPay would, for the HMAC path. */
export function signWebhook(rawBody: string, secret = "test-webhook-secret", timestamp = String(Date.now())) {
  return {
    signature: crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"),
    timestamp,
  };
}
