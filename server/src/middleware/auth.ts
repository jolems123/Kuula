import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./error-handler.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("Missing JWT_SECRET environment variable");
}
const JWT_SECRET: string = jwtSecret;

export type UserRole = "admin" | "manager" | "officer" | "customer" | "user";

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

// Augment Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded !== "object" || decoded === null) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const payload = decoded as Partial<JwtPayload>;
    if (!payload.userId || !payload.role) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    req.user = { userId: payload.userId, role: normalizeRole(payload.role) };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRoles(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  return requireRoles("admin")(req, res, next);
}

export function normalizeRole(role: string | null | undefined): UserRole {
  const value = (role || "").toLowerCase().trim();
  if (value === "admin" || value === "manager" || value === "officer" || value === "customer" || value === "user") {
    return value;
  }
  throw new AppError("Invalid user role", 403);
}
