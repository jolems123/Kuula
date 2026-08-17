import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, requestId: req.requestId ?? null });
    return;
  }

  // PostgreSQL is the race-safe final authority for per-account OTP delivery
  // quotas. Map its deliberate trigger exception to a normal rate-limit result
  // rather than leaking a database error or returning HTTP 500.
  if (/OTP delivery quota exceeded/i.test(err?.message || "")) {
    res.status(429).json({
      error: "Too many verification messages have been requested. Try again later.",
      requestId: req.requestId ?? null,
    });
    return;
  }

  if (err.name === "PrismaClientKnownRequestError") {
    res.status(400).json({ error: "Database operation failed", requestId: req.requestId ?? null });
    return;
  }

  console.error(JSON.stringify({
    event: "http.unhandled_error",
    requestId: req.requestId ?? null,
    name: err?.name,
    message: err?.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
  }));
  res.status(500).json({ error: "Internal server error", requestId: req.requestId ?? null });
}
