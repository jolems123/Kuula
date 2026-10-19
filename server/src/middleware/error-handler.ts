import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) { _next(err); return; }
  const parserType = (err as Error & { type?: string }).type;
  const parserErrors: Record<string, [number, string]> = {
    "entity.parse.failed": [400, "Request contains invalid JSON"],
    "entity.too.large": [413, "Request is too large. Reduce the attachment size and try again."],
    "encoding.unsupported": [415, "Unsupported request encoding"],
    "charset.unsupported": [415, "Unsupported request character set"],
    "request.size.invalid": [400, "Invalid request size"],
    "request.aborted": [400, "Request was interrupted. Please try again."],
  };
  if (parserType && parserErrors[parserType]) {
    const [status, error] = parserErrors[parserType];
    res.status(status).json({ error, requestId: req.requestId ?? null });
    return;
  }
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
