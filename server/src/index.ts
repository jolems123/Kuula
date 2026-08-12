import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import authRoutes from "./routes/auth.js";
import loanRoutes from "./routes/loans.js";
import paymentRoutes from "./routes/payments.js";
import messageRoutes from "./routes/messages.js";
import transactionRoutes from "./routes/transactions.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import adminKycRoutes from "./routes/admin-kyc.js";
import adminCreditDataRoutes from "./routes/admin-credit-data.js";
import adminReconciliationRoutes from "./routes/admin-reconciliation.js";
import kycRoutes from "./routes/kyc.js";
import networkRoutes from "./routes/network.js";
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
    "AFRICASTALKING_USERNAME",
    "AFRICASTALKING_API_KEY",
    "CORS_ORIGINS",
    "KYC_STORAGE_PROVIDER",
    "KYC_S3_BUCKET",
    "KYC_S3_REGION"
  );
  if (realMoneyEnabled) {
    requiredEnvVars.push(
      "MARZPAY_API_KEY",
      "MARZPAY_API_SECRET",
      "MARZPAY_WEBHOOK_SECRET",
      "PUBLIC_API_URL"
    );
  }
}
const missing = requiredEnvVars.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (isProduction && process.env.SMS_PROVIDER?.trim().toLowerCase() !== "africastalking") {
  console.error("SMS_PROVIDER must be africastalking in production");
  process.exit(1);
}
if (isProduction && process.env.TEST_OTP_CODE) {
  console.error("TEST_OTP_CODE must never be configured in production");
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

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.disable("x-powered-by");
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

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use("/api/payments/marzpay/webhook", rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use("/api/kyc", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || "2.4.1",
    realMoneyEnabled,
  });
});
app.get("/api/compliance", (_req, res) => res.json(COMPLIANCE));

app.use("/api/auth", authRoutes);
app.use("/api/network", networkRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/kyc", adminKycRoutes);
app.use("/api/admin/credit-data", adminCreditDataRoutes);
app.use("/api/admin/reconciliation", adminReconciliationRoutes);
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
  res.status(503).json({
    error: "Wallet top-ups are unavailable. Kuula does not maintain a customer cash wallet.",
    code: "WALLET_TOPUP_DISABLED",
  });
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
    prisma.authSession.updateMany({
      where: { userId: req.user!.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  res.json({ ok: true });
});

app.use(errorHandler);

const stopReconciliationSweeper = startReconciliationSweeper();
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "server.started", port: PORT, realMoneyEnabled }));
});

async function shutdown(signal: string) {
  stopReconciliationSweeper();
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log(JSON.stringify({ event: "server.stopped", signal }));
    process.exit(0);
  });
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
