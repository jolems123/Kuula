/**
 * Async wrapper + global error handler. Eliminates try/catch boilerplate in
 * every route handler; throws reach the central error handler which formats
 * a consistent JSON shape.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { logger } from "./logger.js";

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncFn): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const apiErr =
    err instanceof ApiError ? err :
    err instanceof Error ? new ApiError(500, err.message) :
    new ApiError(500, "Internal server error");

  if (apiErr.status >= 500) {
    logger.error({ err, path: req.path, method: req.method }, "unhandled error");
  } else if (apiErr.status >= 400) {
    logger.warn({ err: apiErr, path: req.path, method: req.method }, "client error");
  }

  res.status(apiErr.status).json({
    error: apiErr.message,
    code: apiErr.code,
    ...(apiErr.details ? { details: apiErr.details } : {}),
  });
}

/** 404 handler — anything not matched by a route. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Not found: ${req.method} ${req.path}`));
}
