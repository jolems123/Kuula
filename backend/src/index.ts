/**
 * Kuula API — entry point. Wires migrations, the Express app, graceful shutdown.
 */
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./middleware/logger.js";
import { runMigrations } from "./db/migrate.js";
import { closePool } from "./db/client.js";
import { stopCollectionsSweep } from "./jobs/collections.js";

async function boot(): Promise<void> {
  logger.info({ env: config.env, port: config.port, version: config.app.version }, "kuula-api booting");

  if (config.db.autoMigrate && !config.isTest) {
    try {
      const { applied } = await runMigrations();
      logger.info({ applied }, "migrations applied");
    } catch (err) {
      logger.error({ err }, "migration failed — aborting boot");
      process.exit(1);
    }
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ url: `http://localhost:${config.port}` }, "kuula-api listening");
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    stopCollectionsSweep();
    server.close(async () => {
      await closePool();
      logger.info("shutdown complete");
      process.exit(0);
    });
    // Force exit after 10s if connections hang.
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaught exception — crashing");
    process.exit(1);
  });
}

boot().catch((err) => {
  logger.error({ err }, "boot crashed");
  process.exit(1);
});
