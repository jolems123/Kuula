import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    res.status(400).json({ error: "Database operation failed" });
    return;
  }

  // Unexpected errors
  console.error("Unhandled error:", {
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  });
  res.status(500).json({ error: "Internal server error", detail: err?.message || "unknown" });
}
