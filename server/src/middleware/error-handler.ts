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
