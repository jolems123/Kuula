import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./routes/auth.js";
import loanRoutes from "./routes/loans.js";
import paymentRoutes from "./routes/payments.js";
import savingsRoutes from "./routes/savings.js";
import messageRoutes from "./routes/messages.js";
import transactionRoutes from "./routes/transactions.js";
import goalRoutes from "./routes/goals.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import kycRoutes from "./routes/kyc.js";
import { COMPLIANCE } from "./lib/compliance.js";

const isProduction = process.env.NODE_ENV === "production";
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
if (isProduction) {
  requiredEnvVars.push(
    "OTP_PEPPER",
    "SMS_PROVIDER",
    "AFRICASTALKING_USERNAME",
    "AFRICASTALKING_API_KEY",
    "CORS_ORIGINS"
  );
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

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin is not allowed"));
  },
  credentials: true,
}));

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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
  res.json({ ok: true, timestamp: new Date().toISOString(), version: "2.4.1-local" });
});
app.get("/api/compliance", (_req, res) => res.json(COMPLIANCE));

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);

import { authenticateToken } from "./middleware/auth.js";
import { computeCreditScore } from "./lib/credit-score.js";
import { recognizedSavingsBalance } from "./lib/savings-policy.js";
app.get("/api/credit/score", authenticateToken, async (req, res) => {
  const prisma = (await import("./lib/prisma.js")).default;
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { savingsAccount: true },
  });
  if (!user || user.deletedAt) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(computeCreditScore({
    momoMonths: user.momoMonths ?? 0,
    momoTxnCount: user.momoTxnCount ?? 0,
    crbStatus: user.crbStatus ?? "thin",
    savingsBalance: recognizedSavingsBalance(user.savingsAccount?.balance),
    kycVerified: user.kycVerified ?? false,
    loansRepaid: user.loansRepaid ?? 0,
    loansTotal: user.loansTotal ?? 0,
  }));
});

app.post("/api/wallet/topup", (_req, res) => {
  res.status(400).json({
    error: "Wallet top-ups are made from your mobile money when a payment is collected.",
  });
});

app.post("/api/users/me/delete", authenticateToken, async (req, res) => {
  const prisma = (await import("./lib/prisma.js")).default;
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      deletedAt: new Date(),
      authVersion: { increment: 1 },
      otpHash: null,
      otpPurpose: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpLockedUntil: null,
    },
  });
  res.json({ ok: true });
});

app.use(errorHandler);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Kuula server running on http://0.0.0.0:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
