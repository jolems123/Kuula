import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import authRoutes from "./routes/auth.js";
import authPrivacyGuardRoutes from "./routes/auth-privacy-guard.js";
import httpsEnforcementRoutes from "./routes/https-enforcement.js";
import operationsAuditGuardRoutes from "./routes/operations-audit-guard.js";
import loanRoutes from "./routes/loans.js";
import loanApplicationReadRoutes from "./routes/loan-application-read-routes.js";
import paymentRoutes from "./routes/payments.js";
import paymentFailureGuardRoutes from "./routes/payment-failure-guard.js";
import disbursementRoutes from "./routes/disbursement-routes.js";
import disbursementReconciliationGuardRoutes from "./routes/disbursement-reconciliation-guard.js";
import disbursementWebhookRoutes from "./routes/disbursement-webhooks.js";
import paymentProviderLimitRoutes from "./routes/payment-provider-limits.js";
import partnerFinancingRoutes from "./routes/partner-financing-routes.js";
import partnerOfferGuardRoutes from "./routes/partner-offer-guard.js";
import messageRoutes from "./routes/messages.js";
import transactionRoutes from "./routes/transactions.js";
import notificationRoutes from "./routes/notifications.js";
import ussdRoutes from "./routes/ussd.js";
import adminRoutes from "./routes/admin.js";
import staffRoutes from "./routes/staff.js";
import adminKycRoutes from "./routes/admin-kyc.js";
import adminCreditDataRoutes from "./routes/admin-credit-data.js";
import adminReconciliationRoutes from "./routes/admin-reconciliation.js";
import adminPartnerFinancingRoutes from "./routes/admin-partner-financing.js";
import kycRoutes from "./routes/kyc.js";
import networkRoutes from "./routes/network.js";
import creditOperationsGuardRoutes from "./routes/credit-operations-guards.js";
import creditOperationsRoutes from "./routes/credit-operations.js";
import creditOperationsDirectoryRoutes from "./routes/credit-operations-directory.js";
import customerCreditMessagesRoutes from "./routes/customer-credit-messages.js";
import creditReviewPrerequisiteRoutes from "./routes/credit-review-prerequisite.js";
import productionSecurityGuardRoutes from "./routes/production-security-guards.js";
import { loanFinancialFallbackGuard, networkFinancialFallbackGuard } from "./routes/legacy-financial-route-guards.js";
import { COMPLIANCE } from "./lib/compliance.js";
import { authenticateToken } from "./middleware/auth.js";
import { computeCreditScore } from "./lib/credit-score.js";
import { effectiveCreditEvidence } from "./lib/credit-evidence.js";
import { startReconciliationSweeper } from "./lib/reconciliation.js";
import prisma from "./lib/prisma.js";

const isProduction = process.env.NODE_ENV === "production";
const realMoneyEnabled = process.env.NODE_ENV === "test" || process.env.REAL_MONEY_ENABLED === "true";
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
if (isProduction) {
  requiredEnvVars.push(
    "OTP_PEPPER",
    "SMS_PROVIDER",
    "EGOSMS_USERNAME",
    "EGOSMS_PASSWORD",
    "CORS_ORIGINS",
    "KYC_STORAGE_PROVIDER",
    "KYC_S3_BUCKET",
    "KYC_S3_REGION",
    "TRUST_PROXY_HOPS"
  );
  if (realMoneyEnabled) {
    requiredEnvVars.push(
      "MARZPAY_API_KEY",
      "MARZPAY_API_SECRET",
      "MARZPAY_WEBHOOK_SECRET",
      "MARZPAY_WEBHOOK_SIGNATURE_SECRET",
      "PUBLIC_API_URL"
    );
  }
}
const missing = requiredEnvVars.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (isProduction && process.env.SMS_PROVIDER?.trim().toLowerCase() !== "egosms") {
  console.error("SMS_PROVIDER must be egosms in production");
  process.exit(1);
}
if (isProduction && (process.env.TEST_OTP_CODE || process.env.ALLOW_LOCAL_DEV_OTP === "true")) {
  console.error("Local/test OTP configuration must never be enabled in production");
  process.exit(1);
}
if (isProduction && process.env.KYC_STORAGE_PROVIDER?.trim().toLowerCase() !== "s3") {
  console.error("KYC_STORAGE_PROVIDER must be s3 in production");
  process.exit(1);
}
if (isProduction && process.env.MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN === "true") {
  console.error("MARZPAY_ALLOW_QUERY_WEBHOOK_TOKEN must be false in production");
  process.exit(1);
}
if (isProduction && realMoneyEnabled) {
  try {
    const publicUrl = new URL(process.env.PUBLIC_API_URL!);
    if (publicUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0"].includes(publicUrl.hostname)) {
      throw new Error("PUBLIC_API_URL must be a public HTTPS URL when real money is enabled");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "PUBLIC_API_URL is invalid");
    process.exit(1);
  }
}

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || (isProduction ? NaN : 1));
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  console.error("TRUST_PROXY_HOPS must be an integer from 0 to 5 matching the exact production proxy topology");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", trustProxyHops);
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin is not allowed"));
  },
  credentials: false,
}));

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api/payments/marzpay/webhook", rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/payments/marzpay/webhook",
}));

const jsonVerify = (req: express.Request, _res: express.Response, buffer: Buffer): void => {
  if (req.originalUrl.startsWith("/api/payments/marzpay/webhook")) {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
};
app.use("/api/kyc", express.json({ limit: "15mb", verify: jsonVerify }));
app.use("/api/operations", express.json({ limit: "15mb", verify: jsonVerify }));
app.use(express.json({ limit: "1mb", verify: jsonVerify }));

app.use("/api", httpsEnforcementRoutes);
app.use("/api", productionSecurityGuardRoutes);
app.use("/api", operationsAuditGuardRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), version: process.env.APP_VERSION || "2.4.1", realMoneyEnabled });
});

app.get("/api/ready", async (_req, res) => {
  try {
    const [schema] = await prisma.$queryRaw<Array<{ missing_tables: string[] }>>`
      SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public.users') IS NULL THEN 'users' END,
        CASE WHEN to_regclass('public.markets') IS NULL THEN 'markets' END,
        CASE WHEN to_regclass('public.disbursement_batches') IS NULL THEN 'disbursement_batches' END,
        CASE WHEN to_regclass('public.disbursement_legs') IS NULL THEN 'disbursement_legs' END,
        CASE WHEN to_regclass('public.journals') IS NULL THEN 'journals' END
      ], NULL) AS missing_tables
    `;
    if (schema.missing_tables.length) {
      throw new Error(`Database schema is incomplete: ${schema.missing_tables.join(", ")}`);
    }
    res.json({ ok: true, database: "ready", schema: "ready", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({
      event: "readiness.failed",
      error: error instanceof Error ? error.message : "Database readiness check failed",
    }));
    res.status(503).json({ ok: false, database: "unavailable", timestamp: new Date().toISOString() });
  }
});

app.get("/api/compliance", (_req, res) => res.json(COMPLIANCE));
app.use("/api", ussdRoutes);

app.use("/api/auth", authPrivacyGuardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/network", partnerFinancingRoutes);
app.use("/api/network", networkFinancialFallbackGuard);
app.use("/api/network", networkRoutes);
app.use("/api/loans", loanApplicationReadRoutes);
app.use("/api/loans", partnerOfferGuardRoutes);
app.use("/api/loans", creditReviewPrerequisiteRoutes);
app.use("/api/loans", disbursementRoutes);
app.use("/api/loans", loanFinancialFallbackGuard);
app.use("/api/loans", loanRoutes);
app.use("/api/payments", paymentFailureGuardRoutes);
app.use("/api/payments", disbursementReconciliationGuardRoutes);
app.use("/api/payments", disbursementWebhookRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customer", customerCreditMessagesRoutes);
app.use("/api/operations", creditOperationsGuardRoutes);
app.use("/api/operations", creditOperationsDirectoryRoutes);
app.use("/api/operations", creditOperationsRoutes);
app.use("/api/admin/payment-provider-limits", paymentProviderLimitRoutes);
app.use("/api/admin/partner-financing", adminPartnerFinancingRoutes);
app.use("/api/admin/kyc", adminKycRoutes);
app.use("/api/admin/credit-data", adminCreditDataRoutes);
app.use("/api/admin/reconciliation", adminReconciliationRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);

app.get("/api/credit/score", authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || user.deletedAt) {
    res.status(404).json({ error: "User not found", requestId: req.requestId ?? null });
    return;
  }
  const evidence = await effectiveCreditEvidence(user.id);
  res.json(computeCreditScore({
    momoMonths: evidence.momoMonths,
    momoTxnCount: evidence.momoTxnCount,
    crbStatus: evidence.crbStatus,
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  }));
});

app.post("/api/wallet/topup", (_req, res) => {
  res.status(503).json({ error: "Wallet top-ups are unavailable. Kuula does not maintain a customer cash wallet.", code: "WALLET_TOPUP_DISABLED" });
});

app.post("/api/users/me/delete", authenticateToken, async (req, res) => {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        deletedAt: now,
        authVersion: { increment: 1 },
        otpHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpLockedUntil: null,
      },
    }),
    prisma.authSession.updateMany({ where: { userId: req.user!.userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  res.json({ ok: true });
});

app.use(errorHandler);

const stopReconciliationSweeper = startReconciliationSweeper();
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server.started", port: PORT, realMoneyEnabled }));
});

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopReconciliationSweeper();
  const forceExit = setTimeout(() => process.exit(exitCode || 1), 10_000);
  forceExit.unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log(JSON.stringify({ event: "server.stopped", signal, exitCode }));
    clearTimeout(forceExit);
    process.exit(exitCode);
  });
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({
    event: "process.unhandled_rejection",
    error: reason instanceof Error ? reason.message : String(reason),
  }));
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({ event: "process.uncaught_exception", error: error.message }));
  void shutdown("uncaughtException", 1);
});
