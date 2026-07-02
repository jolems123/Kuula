/**
 * Express app wiring. All middleware (helmet, cors, rate-limit, pino, routes,
 * error handler) is attached here so the test suite can mount the app without
 * booting the server listener.
 */
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { logger } from "./middleware/logger.js";
import { generalLimiter, writeLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { savingsRouter } from "./modules/savings/savings.routes.js";
import { walletRouter } from "./modules/wallet/wallet.routes.js";
import { creditRouter } from "./modules/credit/credit.routes.js";
import { complianceRouter } from "./modules/compliance/compliance.routes.js";
import { loansRouter } from "./modules/loans/loans.routes.js";
import { messagesRouter } from "./modules/messages/messages.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { transactionsRouter } from "./modules/transactions/transactions.routes.js";
import { disbursementsRouter } from "./modules/disbursements/disbursements.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { startCollectionsSweep } from "./jobs/collections.js";

export function createApp(): Express {
  const app = express();

  // ── Core middleware ───────────────────────────────────────────────────────
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: false, // API only — no browser-side rendering
    crossOriginResourcePolicy: false,
  }));
  app.use(cors({
    origin: (origin, cb) => {
      // Allow requests with no Origin (curl, mobile apps, server-to-server).
      if (!origin) return cb(null, true);
      if (config.cors.origins.includes(origin) || config.cors.origins.includes("*")) {
        return cb(null, true);
      }
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  // ── Rate limiting ─────────────────────────────────────────────────────────
  app.use("/api/", generalLimiter);
  app.use("/api/loans/", writeLimiter);
  app.use("/api/savings/", writeLimiter);
  app.use("/api/wallet/", writeLimiter);
  app.use("/api/messages", writeLimiter);

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "kuula-api", version: config.app.version, time: new Date().toISOString() });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/compliance", complianceRouter);
  app.use("/api/credit", creditRouter);
  app.use("/api/savings", savingsRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/loans", loansRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/mtn", disbursementsRouter);   // legacy paths used by the frontend
  app.use("/api/airtel", disbursementsRouter);
  app.use("/api/admin", adminRouter);

  // ── 404 + error ───────────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  // ── Background jobs (no-op in test) ───────────────────────────────────────
  if (!config.isTest) {
    startCollectionsSweep();
  }

  return app;
}
