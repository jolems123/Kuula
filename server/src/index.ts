import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./routes/auth.js";
import loanRoutes from "./routes/loans.js";
import savingsRoutes from "./routes/savings.js";
import messageRoutes from "./routes/messages.js";
import transactionRoutes from "./routes/transactions.js";
import goalRoutes from "./routes/goals.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import kycRoutes from "./routes/kyc.js";
import webhookRoutes from "./routes/webhooks.js";
import { COMPLIANCE } from "./lib/compliance.js";
import { configErrors, paymentsConfigured, smsConfigured, IS_PRODUCTION } from "./lib/config.js";
import { reconcilePendingDisbursements } from "./lib/disbursement.js";
import { reconcilePendingCollections, markOverdueRepayments } from "./lib/repayment.js";
import { purgeExpiredOtps } from "./lib/otp.js";
import { purgeExpiredSessions } from "./lib/sessions.js";

// Validate DATABASE_URL at startup
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Please set them in a .env file or environment.");
  process.exit(1);
}

// A production deployment must never be able to start in a state where it
// would simulate payments or console-log OTPs. Fail the boot instead.
const problems = configErrors();
if (problems.length > 0) {
  console.error("Configuration errors:");
  for (const p of problems) console.error(`  - ${p}`);
  if (IS_PRODUCTION) process.exit(1);
  console.warn("Continuing in non-production mode. These MUST be fixed before deploying.");
}

if (!IS_PRODUCTION) {
  console.log(`  payments: ${paymentsConfigured() ? "MarzPay configured" : "NOT configured (disbursement/repayment will 503)"}`);
  console.log(`  sms:      ${smsConfigured() ? "provider configured" : "dev logger (OTPs printed locally)"}`);
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  })
);

app.use(cookieParser());

// The provider's callback IP is not the user's, and MarzPay may burst
// redeliveries. It is authenticated by HMAC, so it gets its own generous limit
// rather than competing with user traffic for the global one.
app.use(
  "/api/webhooks",
  rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Webhooks need the EXACT bytes that were signed — re-serialising the parsed
// body would change key order or whitespace and break the HMAC.
app.use(
  "/api/webhooks",
  express.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  })
);
app.use("/api/webhooks", webhookRoutes);

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// OTP endpoints are the cheapest thing to abuse (each request costs us an SMS
// and can be used to harass a phone number), so they are limited by IP on top
// of the per-phone cooldown and hourly cap enforced in lib/otp.ts.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification requests. Please try again later." },
});
app.use("/api/auth/resend-otp", otpLimiter);
app.use("/api/auth/verify-phone", otpLimiter);
app.use("/api/auth/reset-password", otpLimiter);
app.use("/api/auth/signup", otpLimiter);

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// KYC accepts two base64-encoded ID images, so it needs a larger body limit
// than the rest of the API. This is scoped to /api/kyc and runs before the
// global 1mb parser; express.json is idempotent (skips if body already read).
app.use("/api/kyc", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), version: "2.4.1-local" });
});

// Compliance
app.get("/api/compliance", (_req, res) => {
  res.json(COMPLIANCE);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);

// Credit score
import { authenticateToken } from "./middleware/auth.js";
import { computeCreditScore } from "./lib/credit-score.js";
app.get("/api/credit/score", authenticateToken, async (req, res) => {
  const prisma = (await import("./lib/prisma.js")).default;
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const score = computeCreditScore({
    momoMonths: user.momoMonths ?? 0,
    momoTxnCount: user.momoTxnCount ?? 0,
    crbStatus: user.crbStatus ?? "thin",
    savingsBalance: Number(user.savingsAccount?.balance ?? 0),
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  });

  res.json(score);
});

// Wallet top-up — permanently removed (C-07). The in-app wallet was a
// simulation; loan proceeds now go to the borrower's own mobile money and
// repayments are collected from it, so there is no balance to top up.
app.post("/api/wallet/topup", (_req, res) => {
  res.status(410).json({
    error:
      "Kuula no longer holds an in-app balance. Loans are sent to your mobile money, " +
      "and repayments are collected from it.",
  });
});

// User deletion
app.post("/api/users/me/delete", authenticateToken, async (req, res) => {
  const prisma = (await import("./lib/prisma.js")).default;
  const { revokeAllSessions } = await import("./lib/sessions.js");
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { deletedAt: new Date() },
  });
  // A deleted account's outstanding sessions must stop working immediately.
  await revokeAllSessions(req.user!.userId);
  res.json({ ok: true });
});

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Kuula server running on http://0.0.0.0:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});

/**
 * Background maintenance.
 *
 * The reconciliation sweeps are the safety net behind the webhook: if a
 * callback is lost, or a provider call timed out and left us unsure whether
 * money moved, these ask MarzPay what actually happened and settle through the
 * same exactly-once path. Without them, an ambiguous payout would sit `pending`
 * forever.
 */
const maintenance = setInterval(
  () => {
    void (async () => {
      try {
        await reconcilePendingDisbursements();
        await reconcilePendingCollections();
        await markOverdueRepayments();
        await purgeExpiredOtps();
        await purgeExpiredSessions();
      } catch (err) {
        console.error("[maintenance] sweep failed", err);
      }
    })();
  },
  5 * 60 * 1000
);
maintenance.unref();

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
