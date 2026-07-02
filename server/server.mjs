/**
 * Kuula API — reference backend.
 *
 * Zero-dependency Node 22+ HTTP server. Credentials live ONLY here (hashed),
 * never in the client bundle. Replace the seed store with a real database and
 * the OTP stub with an SMS provider before production.
 *
 *   node server/server.mjs            # listens on PORT (default 3000)
 *
 * Env:
 *   PORT               listen port                 (default 3000)
 *   KUULA_API_SECRET   HMAC secret for tokens      (default: dev secret)
 *   CORS_ORIGIN        allowed origin              (default *, dev only)
 */
import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  COMPLIANCE, priceLoan, computeCreditScore, createDisbursement, disbursementStatus,
  createRepayment, collectionStage, attemptAutoPay, accrueSavingsInterest,
  validateApplication, computeEligibility, priceLoanV2, LOAN_RULES,
} from "./core.mjs";
import { momo, airtel, providerFor } from "./providers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(__dirname, "data", "seed.json"), "utf8"));

// ── Shared store ──────────────────────────────────────────────────────────────
// In-memory but shared across every connected client of this process, so a
// customer on one device and an admin on another see the same data. Swap for a
// real database in production; the shapes below are the contract.
const store = {
  messages: structuredClone(seed.messages ?? []),
  loanApplications: [],
  disbursements: {},   // disbursementId -> record
  repayments: {},      // loanId -> repayment schedule
  savings: {},         // userId -> { balance, updatedAt }
  wallet: {},          // userId -> mobile-money wallet balance (UGX)
  transactions: [],    // ledger: disbursement / payment / deposit / withdrawal
};

/** Append a transaction-ledger record and return it. */
function addTransaction({ userId, loanId = null, type, amount, status, transactionId = null }) {
  const tx = {
    id: `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId, loanId, type, amount, status,
    transactionId,
    createdAt: new Date().toISOString(),
  };
  store.transactions.unshift(tx);
  return tx;
}

const ADMIN_ID = (seed.users.find((u) => u.role === "admin") ?? {}).id ?? "ADMIN-2024-000001";
const userName = (id) => (seed.users.find((u) => u.id === id) ?? {}).fullName ?? id;
const userPhone = (id) => (seed.users.find((u) => u.id === id) ?? {}).phone ?? "+256 770 123 456";

function savingsFor(userId) {
  if (!store.savings[userId]) {
    store.savings[userId] = { balance: seed.savings?.balance ?? 0, updatedAt: Date.now() };
  }
  return store.savings[userId];
}
const walletFor = (userId) => (store.wallet[userId] ??= seed.walletBalance ?? 0);

// Real, explainable credit score from the five data sources.
function creditScoreFor(userId) {
  const inputs = (seed.creditInputs ?? {})[userId] ?? { momoMonths: 0, momoTxnCount: 0, crbStatus: "thin", kycVerified: false };
  return computeCreditScore({
    ...inputs,
    savingsBalance: savingsFor(userId).balance,
    loansRepaid: seed.loanProfile?.totalLoansRepaid ?? 0,
    loansTotal: seed.loanProfile?.totalLoansCount ?? 0,
  });
}

// Serialise an application with its live disbursement + collection status.
function serializeApplication(app) {
  const disb = app.disbursementId ? disbursementStatus(store.disbursements[app.disbursementId]) : null;
  const rep = app.loanId ? store.repayments[app.loanId] : null;
  return {
    ...app,
    disbursement: disb,
    repayment: rep ? { ...rep, collection: collectionStage(rep) } : null,
  };
}

const PORT = Number(process.env.PORT ?? 3000);
const SECRET = process.env.KUULA_API_SECRET ?? "dev-only-secret-change-me";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ── Credential store ──────────────────────────────────────────────────────────
// Demo deployment seeds fixed credentials (user PIN 1234, admin password
// kuula-admin-2026). A real deployment replaces this with a user database.
const scrypt = (value, salt) => crypto.scryptSync(value, salt, 32).toString("hex");
const CREDENTIALS = {
  "+256770123456": { salt: "kuula-user-1", hash: scrypt("1234", "kuula-user-1") },
  "admin@kuula.ug": { salt: "kuula-admin-1", hash: scrypt("kuula-admin-2026", "kuula-admin-1") },
};

const verifyCredential = (key, value) => {
  const cred = CREDENTIALS[key];
  if (!cred) return false;
  const candidate = Buffer.from(scrypt(value, cred.salt));
  const expected = Buffer.from(cred.hash);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

// ── Tokens (HMAC-signed, JWT-shaped payload) ─────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString("base64url");

function signToken(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// ── Session payloads ──────────────────────────────────────────────────────────
const normalizePhone = (p) => String(p ?? "").replace(/[\s-]/g, "");

const publicUser = (u) => {
  const { ...rest } = u;
  return rest;
};

// Messages visible to a given session: admins see everything, users see only
// their own thread with support.
function messagesFor(payload) {
  if (payload.role === "admin") return store.messages;
  return store.messages.filter(
    (m) => m.senderId === payload.sub || m.receiverId === payload.sub
  );
}

function sessionFor(user) {
  const isAdmin = user.role === "admin";
  const score = isAdmin ? null : creditScoreFor(user.id);
  return {
    token: signToken({ sub: user.id, role: user.role }),
    role: user.role,
    user: publicUser(user),
    credit: isAdmin ? null : {
      ...seed.creditProfile,
      score: score.score,
      maxScore: score.maxScore,
      tier: score.tier,
      percentile: score.percentile,
    },
    loan: isAdmin ? null : seed.loanProfile,
    savingsBalance: isAdmin ? 0 : savingsFor(user.id).balance,
    messages: messagesFor({ sub: user.id, role: user.role }),
    unreadNotifications: seed.notifications.filter((n) => !n.read).length,
  };
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 64 * 1024) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });

const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

// ── Routes ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, { ok: true, service: "kuula-api", time: new Date().toISOString() });
  }

  try {
    if (req.method === "POST" && pathname === "/api/auth/login") {
      const { phone, pin } = await readBody(req);
      const user = seed.users.find(
        (u) => u.role === "user" && normalizePhone(u.phone) === normalizePhone(phone)
      );
      if (!user || !verifyCredential(normalizePhone(user.phone), String(pin ?? ""))) {
        return json(res, 401, { error: "Invalid phone number or PIN" });
      }
      return json(res, 200, sessionFor(user));
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      const { name, phone, email, password, nationalId } = await readBody(req);
      // Spec validation: +256 phone, valid email, password >= 8, NIN 10–12 digits.
      const phoneOk = /^\+256\d{9}$/.test(normalizePhone(phone));
      const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? ""));
      const pwOk = String(password ?? "").length >= 8;
      const ninOk = /^\d{10,12}$/.test(String(nationalId ?? "").replace(/\s/g, ""));
      if (!phoneOk) return json(res, 400, { error: "Phone must be in the format +256XXXXXXXXX" });
      if (!emailOk) return json(res, 400, { error: "Enter a valid email address" });
      if (!pwOk)    return json(res, 400, { error: "Password must be at least 8 characters" });
      if (!ninOk)   return json(res, 400, { error: "National ID must be 10–12 digits" });
      if (seed.users.some((u) => normalizePhone(u.phone) === normalizePhone(phone))) {
        return json(res, 409, { error: "An account with this phone number already exists" });
      }
      const id = `KUU-${new Date().getFullYear()}-${String(seed.users.length + 1).padStart(6, "0")}`;
      const user = {
        id, role: "user", initials: String(name ?? "K U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        fullName: name, phone, email, nationalId, dateOfBirth: "", district: "", occupation: "",
        memberSince: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }), verified: false, avatarUrl: null,
      };
      seed.users.push(user);
      seed.creditInputs = seed.creditInputs ?? {};
      seed.creditInputs[id] = { momoMonths: 0, momoTxnCount: 0, crbStatus: "thin", kycVerified: false };
      return json(res, 201, { ok: true, needsConfirmation: false });
    }

    if (req.method === "POST" && pathname === "/api/auth/reset-password") {
      const { email } = await readBody(req);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? ""))) {
        return json(res, 400, { error: "Enter a valid email address" });
      }
      // Demo backend does not send email; a real deployment triggers the provider.
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/auth/admin-login") {
      const { email, password } = await readBody(req);
      const user = seed.users.find(
        (u) => u.role === "admin" && u.email === String(email ?? "").trim().toLowerCase()
      );
      if (!user || !verifyCredential(user.email, String(password ?? ""))) {
        return json(res, 401, { error: "Invalid credentials" });
      }
      return json(res, 200, sessionFor(user));
    }

    if (req.method === "POST" && pathname === "/api/auth/verify-otp") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const { code } = await readBody(req);
      // OTP stub: demo accepts any 6-digit code; production sends + checks SMS.
      if (!/^\d{6}$/.test(String(code ?? ""))) {
        return json(res, 400, { error: "Enter the 6-digit code" });
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const user = seed.users.find((u) => u.id === payload.sub);
      if (!user) return json(res, 404, { error: "User not found" });
      return json(res, 200, sessionFor(user));
    }

    // ── Support messaging (customer ↔ admin) ─────────────────────────────────
    if (pathname === "/api/messages") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });

      if (req.method === "GET") {
        return json(res, 200, { messages: messagesFor(payload) });
      }
      if (req.method === "POST") {
        const { receiverId, content } = await readBody(req);
        const text = String(content ?? "").trim();
        if (!text) return json(res, 400, { error: "Message cannot be empty" });
        // Customers can only message support (the admin); admins choose the user.
        const to = payload.role === "admin" ? String(receiverId ?? "") : ADMIN_ID;
        if (!to) return json(res, 400, { error: "Missing recipient" });
        const msg = {
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: payload.sub,
          receiverId: to,
          content: text.slice(0, 4000),
          createdAt: new Date().toISOString(),
          isRead: false,
        };
        store.messages.push(msg);
        return json(res, 201, { message: msg });
      }
    }

    // ── Compliance constants (drives in-app disclosures) ─────────────────────
    if (req.method === "GET" && pathname === "/api/compliance") {
      return json(res, 200, {
        maxAprPercent: COMPLIANCE.MAX_APR * 100,
        appleAprCapPercent: COMPLIANCE.APPLE_APR_CAP * 100,
        minTermDays: COMPLIANCE.MIN_TERM_DAYS,
        googleMinTermDays: COMPLIANCE.GOOGLE_MIN_TERM_DAYS,
        savingsAprPercent: COMPLIANCE.SAVINGS_APR * 100,
        savingsDiscountPercent: COMPLIANCE.SAVINGS_DISCOUNT * 100,
        savingsThreshold: COMPLIANCE.SAVINGS_THRESHOLD,
        compound: false,
        dataRetentionYears: 10,
      });
    }

    // ── Credit score (real, computed) ────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/credit/score") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const targetId = payload.role === "admin"
        ? (new URL(req.url, "http://x").searchParams.get("userId") ?? payload.sub)
        : payload.sub;
      return json(res, 200, creditScoreFor(targetId));
    }

    // ── Loan quote (live pricing, APR-capped, savings discount) ───────────────
    if (req.method === "POST" && pathname === "/api/loans/quote") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const { amount, termDays } = await readBody(req);
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return json(res, 400, { error: "Invalid loan amount" });
      return json(res, 200, priceLoan({ principal: amt, termDays: Number(termDays) || COMPLIANCE.MIN_TERM_DAYS, savingsBalance: savingsFor(payload.sub).balance }));
    }

    // ── Savings (balance + interest accrual + deposit/withdraw) ───────────────
    if (pathname === "/api/savings") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const s = savingsFor(payload.sub);
      if (req.method === "GET") {
        const interest = accrueSavingsInterest(s.balance, s.updatedAt);
        return json(res, 200, { balance: s.balance, accruedInterest: interest, aprPercent: COMPLIANCE.SAVINGS_APR * 100 });
      }
    }
    if (req.method === "POST" && (pathname === "/api/savings/deposit" || pathname === "/api/savings/withdraw")) {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const { amount } = await readBody(req);
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return json(res, 400, { error: "Invalid amount" });
      const s = savingsFor(payload.sub);
      if (pathname.endsWith("withdraw")) {
        if (amt > s.balance) return json(res, 400, { error: "Insufficient savings balance" });
        s.balance -= amt;
      } else {
        s.balance += amt;
      }
      s.updatedAt = Date.now();
      return json(res, 200, { balance: s.balance });
    }

    // ── Wallet (mobile-money balance) ────────────────────────────────────────
    if (pathname === "/api/wallet") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      if (req.method === "GET") return json(res, 200, { balance: walletFor(payload.sub) });
    }
    if (req.method === "POST" && pathname === "/api/wallet/topup") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const { amount } = await readBody(req);
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return json(res, 400, { error: "Invalid amount" });
      store.wallet[payload.sub] = walletFor(payload.sub) + amt;
      return json(res, 200, { balance: store.wallet[payload.sub] });
    }

    // ── Loan applications (customer apply → admin decide → disburse → repay) ──
    if (pathname === "/api/loans/applications") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });

      if (req.method === "GET") {
        const apps = payload.role === "admin"
          ? store.loanApplications
          : store.loanApplications.filter((a) => a.applicantId === payload.sub);
        return json(res, 200, { applications: apps.map(serializeApplication) });
      }
      if (req.method === "POST") {
        if (payload.role !== "user") return json(res, 403, { error: "Only customers can apply" });
        const { amount, purpose, termDays, channel } = await readBody(req);
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) return json(res, 400, { error: "Invalid loan amount" });
        const pricing = priceLoan({ principal: amt, termDays: Number(termDays) || COMPLIANCE.MIN_TERM_DAYS, savingsBalance: savingsFor(payload.sub).balance });
        const app = {
          id: `KUL-${new Date().getFullYear()}-${String(store.loanApplications.length + 1).padStart(5, "0")}`,
          applicantId: payload.sub,
          applicantName: userName(payload.sub),
          amount: amt,
          purpose: String(purpose ?? "Personal"),
          termDays: pricing.termDays,
          channel: String(channel ?? "MTN MoMo"),
          pricing,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
          decisionNotes: null,
          disbursementId: null,
          loanId: null,
        };
        store.loanApplications.unshift(app);
        return json(res, 201, { application: serializeApplication(app) });
      }
    }

    if (req.method === "POST" && pathname === "/api/loans/applications/decision") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      if (payload.role !== "admin") return json(res, 403, { error: "Only staff can decide applications" });
      const { id, decision, notes } = await readBody(req);
      if (decision !== "approved" && decision !== "rejected") {
        return json(res, 400, { error: "decision must be 'approved' or 'rejected'" });
      }
      const app = store.loanApplications.find((a) => a.id === id);
      if (!app) return json(res, 404, { error: "Application not found" });
      app.status = decision;
      app.decidedAt = new Date().toISOString();
      app.decisionNotes = String(notes ?? "");

      // Approval triggers instant mobile-money disbursement + a repayment plan.
      if (decision === "approved" && !app.disbursementId) {
        const disb = createDisbursement({ appId: app.id, amount: app.amount, channel: app.channel, msisdn: userPhone(app.applicantId) });
        store.disbursements[disb.id] = disb;
        app.disbursementId = disb.id;
        app.loanId = `LN-${disb.id.slice(5)}`;
        store.repayments[app.loanId] = createRepayment({ loanId: app.loanId, total: app.pricing.total, termDays: app.termDays });
        store.wallet[app.applicantId] = walletFor(app.applicantId) + app.amount; // funds land in wallet
      }
      return json(res, 200, { application: serializeApplication(app) });
    }

    // ── Repayment + auto-collection ──────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/loans/repayment") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const app = store.loanApplications.find((a) => a.applicantId === payload.sub && a.loanId);
      if (!app) return json(res, 200, { repayment: null });
      const rep = store.repayments[app.loanId];
      return json(res, 200, { repayment: { ...rep, collection: collectionStage(rep), walletBalance: walletFor(payload.sub) } });
    }

    if (req.method === "POST" && pathname === "/api/loans/repayment/pay") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const app = store.loanApplications.find((a) => a.applicantId === payload.sub && a.loanId);
      if (!app) return json(res, 404, { error: "No active loan" });
      const rep = store.repayments[app.loanId];
      const attempt = attemptAutoPay(rep, walletFor(payload.sub));
      rep.attempts.push(attempt);
      if (attempt.success) {
        rep.amountPaid = rep.total;
        rep.status = "paid";
        store.wallet[payload.sub] = walletFor(payload.sub) - attempt.amount;
        rep.receipt = { id: `RCPT-${Date.now()}`, amount: attempt.amount, paidAt: new Date().toISOString(), method: "MoMo auto-debit" };
      }
      return json(res, 200, { repayment: { ...rep, collection: collectionStage(rep) }, attempt });
    }

    // ── Credit scoring (0–100 eligibility) ───────────────────────────────────
    if (req.method === "POST" && pathname === "/api/credit-score/calculate") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const body = await readBody(req);
      const targetId = (payload.role === "admin" && body.user_id) ? body.user_id : payload.sub;
      const inputs = (seed.creditInputs ?? {})[targetId] ?? {};
      const e = computeEligibility({
        avgMonthlyBalance: inputs.avgMonthlyBalance ?? (inputs.momoTxnCount ? 60000 : 0),
        crbScore: inputs.crbScore ?? (inputs.crbStatus === "clean" ? 820 : inputs.crbStatus === "thin" ? 520 : 250),
        savingsBalance: savingsFor(targetId).balance,
        loansRepaid: seed.loanProfile?.totalLoansRepaid ?? 0,
        kycVerified: inputs.kycVerified ?? false,
      });
      return json(res, 200, { credit_score: e.score, eligible: e.eligible, max_amount: e.maxAmount, interest_rate: e.interestRate, tier: e.tier, breakdown: e.breakdown });
    }

    // ── Loan application + auto-approve + disbursement ───────────────────────
    if (req.method === "POST" && pathname === "/api/loans/apply") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      if (payload.role !== "user") return json(res, 403, { success: false, error: "Only customers can apply" });
      const { amount, term_days, purpose, disbursement_method } = await readBody(req);

      const valid = validateApplication({ amount, termDays: term_days, purpose, method: disbursement_method });
      if (!valid.ok) return json(res, 400, { success: false, error: valid.error });

      const inputs = (seed.creditInputs ?? {})[payload.sub] ?? {};
      const elig = computeEligibility({
        avgMonthlyBalance: inputs.avgMonthlyBalance ?? (inputs.momoTxnCount ? 60000 : 0),
        crbScore: inputs.crbScore ?? (inputs.crbStatus === "clean" ? 820 : inputs.crbStatus === "thin" ? 520 : 250),
        savingsBalance: savingsFor(payload.sub).balance,
        loansRepaid: seed.loanProfile?.totalLoansRepaid ?? 0,
        kycVerified: inputs.kycVerified ?? false,
      });

      const amt = Number(amount);
      const pricing = priceLoanV2({ principal: amt, termDays: Number(term_days), interestRate: elig.interestRate || 0.26 });
      const loanId = `LN-${Date.now()}`;
      const loan = {
        id: `KUL-${new Date().getFullYear()}-${String(store.loanApplications.length + 1).padStart(5, "0")}`,
        loanId,
        applicantId: payload.sub,
        applicantName: userName(payload.sub),
        amount: amt,
        purpose, channel: disbursement_method,
        termDays: pricing.termDays,
        interestRate: pricing.interestRate,
        serviceFeeRate: pricing.serviceFeeRate,
        interest: pricing.interest,
        serviceFee: pricing.serviceFee,
        total: pricing.total,
        apr: pricing.apr, aprClamped: pricing.clamped,
        pricing,
        status: "pending",
        approvedBy: null,
        createdAt: new Date().toISOString(),
        dueDate: null,
        disbursementId: null,
      };

      // Auto-decision by eligibility + per-tier amount ceiling.
      if (!elig.eligible) {
        loan.status = "rejected";
        loan.approvedBy = "auto-approve";
      } else if (amt > elig.maxAmount) {
        loan.status = "rejected";
        loan.approvedBy = "auto-approve";
        store.loanApplications.unshift(loan);
        return json(res, 200, { success: true, loan_id: loan.id, status: "rejected", reason: `Above your tier limit of UGX ${elig.maxAmount.toLocaleString()}`, credit_score: elig.score });
      } else {
        loan.status = "approved";
        loan.approvedBy = "auto-approve";
      }

      store.loanApplications.unshift(loan);

      if (loan.status === "approved") {
        // Disburse via the chosen mobile-money provider, then record + schedule.
        const prov = providerFor(disbursement_method);
        try {
          const r = await prov.disburse(userPhone(payload.sub), amt, loan.id);
          store.wallet[payload.sub] = walletFor(payload.sub) + amt;
          loan.status = "active";
          loan.dueDate = new Date(Date.now() + pricing.termDays * 86400000).toISOString();
          store.repayments[loanId] = createRepayment({ loanId, total: pricing.total, termDays: pricing.termDays });
          addTransaction({ userId: payload.sub, loanId, type: "loan_disbursement", amount: amt, status: "completed", transactionId: r.transaction_id });
        } catch (e) {
          loan.status = "failed";
          addTransaction({ userId: payload.sub, loanId, type: "loan_disbursement", amount: amt, status: "failed" });
          return json(res, 502, { success: false, error: `Disbursement failed: ${e.message}`, loan_id: loan.id, status: "failed" });
        }
      }

      return json(res, 200, { success: true, loan_id: loan.id, status: loan.status, credit_score: elig.score, pricing });
    }

    // ── Mobile-money endpoints (direct) ──────────────────────────────────────
    if (req.method === "POST" && (pathname === "/api/mtn/disburse" || pathname === "/api/airtel/disburse")) {
      const payload = verifyToken(bearer(req));
      if (!payload || payload.role !== "admin") return json(res, 403, { success: false, error: "Staff only" });
      const { phoneNumber, amount, reference } = await readBody(req);
      const prov = pathname.includes("airtel") ? airtel : momo;
      try {
        const r = await prov.disburse(phoneNumber, Number(amount), reference);
        return json(res, 200, { success: true, transaction_id: r.transaction_id, simulated: r.simulated });
      } catch (e) { return json(res, 502, { success: false, error: e.message }); }
    }
    if (req.method === "POST" && (pathname === "/api/mtn/collection" || pathname === "/api/airtel/collection")) {
      const payload = verifyToken(bearer(req));
      if (!payload || payload.role !== "admin") return json(res, 403, { success: false, error: "Staff only" });
      const { phoneNumber, amount, transactionId } = await readBody(req);
      const prov = pathname.includes("airtel") ? airtel : momo;
      try {
        const r = await prov.collect(phoneNumber, Number(amount), transactionId);
        return json(res, 200, { success: true, transaction_id: r.transaction_id, simulated: r.simulated });
      } catch (e) { return json(res, 502, { success: false, error: e.message }); }
    }

    // ── Collections scheduling ───────────────────────────────────────────────
    if (req.method === "POST" && pathname === "/api/collections/schedule") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const { loan_id, due_date, amount } = await readBody(req);
      if (!loan_id) return json(res, 400, { success: false, error: "loan_id required" });
      // The hourly sweep (runCollections) handles execution; this records intent.
      return json(res, 200, { success: true, scheduled: true, loan_id, due_date: due_date ?? null, amount: amount ?? null });
    }

    // ── Transaction ledger ───────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/transactions") {
      const payload = verifyToken(bearer(req));
      if (!payload) return json(res, 401, { error: "Invalid or expired token" });
      const txns = payload.role === "admin"
        ? store.transactions
        : store.transactions.filter((t) => t.userId === payload.sub);
      return json(res, 200, { transactions: txns });
    }

    if (req.method === "GET" && pathname === "/api/loans/rules") {
      return json(res, 200, LOAN_RULES);
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    const msg = String(err?.message ?? err);
    const status = msg.includes("JSON") || msg.includes("large") ? 400 : 500;
    return json(res, status, { error: status === 400 ? msg : "Internal error" });
  }
});

// ── Auto-collection sweep (hourly cron) ───────────────────────────────────────
// Mirrors the Supabase auto-collect Edge Function for the Node backend: for
// every due, unpaid loan, attempt a mobile-money debit and record the result.
async function runCollections(now = Date.now()) {
  let collected = 0, failed = 0;
  for (const loanId of Object.keys(store.repayments)) {
    const rep = store.repayments[loanId];
    if (rep.status === "paid") continue;
    if (new Date(rep.dueDate).getTime() > now) continue; // not due yet
    const app = store.loanApplications.find((a) => a.loanId === loanId);
    if (!app) continue;
    const outstanding = rep.total - rep.amountPaid;
    const wallet = walletFor(app.applicantId);
    if (wallet >= outstanding) {
      store.wallet[app.applicantId] = wallet - outstanding;
      rep.amountPaid = rep.total;
      rep.status = "paid";
      rep.receipt = { id: `RCPT-${now}`, amount: outstanding, paidAt: new Date(now).toISOString() };
      addTransaction({ userId: app.applicantId, loanId, type: "loan_payment", amount: outstanding, status: "completed" });
      if (app.status === "active") app.status = "paid";
      collected++;
    } else {
      addTransaction({ userId: app.applicantId, loanId, type: "loan_payment", amount: outstanding, status: "failed" });
      failed++;
    }
  }
  if (collected || failed) console.log(`[collections] swept: ${collected} collected, ${failed} failed`);
  return { collected, failed };
}

// Expose the sweep for manual triggering (tests/ops) and run it hourly.
export { runCollections };
const COLLECTION_INTERVAL_MS = 60 * 60 * 1000;
const collectionsTimer = setInterval(() => runCollections().catch((e) => console.error("[collections]", e)), COLLECTION_INTERVAL_MS);
collectionsTimer.unref?.();

server.listen(PORT, () => {
  console.log(`kuula-api listening on http://localhost:${PORT}`);
});
