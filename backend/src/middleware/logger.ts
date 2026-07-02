/**
 * Pino structured logger. One logger per process; `pino-http` adds a per-request
 * child logger at `req.log`. JSON output in prod, pretty-print in dev.
 */
import pino from "pino";
import { config } from "../config.js";

const transport = config.isProd
  ? undefined
  : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" } };

export const logger = pino({
  level: config.logLevel,
  base: { service: "kuula-api", env: config.env, version: config.app.version },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.pin", "*.password", "*.code", "*.token"],
  transport,
});
