import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./routes/auth.js";
import loanRoutes from "./routes/loans.js";
import savingsRoutes from "./routes/savings.js";
import messageRoutes from "./routes/messages.js";
import transactionRoutes from "./routes/transactions.js";
import goalRoutes from "./routes/goals.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import { COMPLIANCE } from "./lib/compliance.js";

// Validate DATABASE_URL at startup
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Please set them in a .env file or environment.");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(cors());
app.use(express.json());

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

// Wallet top-up (disabled - must go through MarzPay)
app.post("/api/wallet/topup", (_req, res) => {
  res.status(400).json({
    error: "Wallet top-ups are made from your mobile money when a payment is collected.",
  });
});

// User deletion
app.post("/api/users/me/delete", authenticateToken, async (req, res) => {
  const prisma = (await import("./lib/prisma.js")).default;
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { deletedAt: new Date() },
  });
  res.json({ ok: true });
});

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Kuula server running on http://0.0.0.0:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});

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
