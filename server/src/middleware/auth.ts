import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { AppError } from "./error-handler.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("Missing JWT_SECRET environment variable");
const JWT_SECRET: string = jwtSecret;

export type UserRole = "admin" | "manager" | "officer" | "customer" | "user";

export interface JwtPayload {
  userId: string;
  role: UserRole;
  authVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "24h",
    issuer: "kuula-api",
    audience: "kuula-app",
  });
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: "kuula-api",
      audience: "kuula-app",
    });
    if (typeof decoded !== "object" || decoded === null) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const candidate = decoded as Partial<JwtPayload>;
    if (!candidate.userId || !candidate.role || !Number.isInteger(candidate.authVersion)) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: candidate.userId },
      select: { role: true, authVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      res.status(401).json({ error: "Session is no longer valid" });
      return;
    }

    const role = normalizeRole(user.role);
    if (role !== normalizeRole(candidate.role) || user.authVersion !== candidate.authVersion) {
      res.status(401).json({ error: "Session has been revoked" });
      return;
    }

    req.user = { userId: candidate.userId, role, authVersion: user.authVersion };
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
  if (["admin", "manager", "officer", "customer", "user"].includes(value)) {
    return value as UserRole;
  }
  throw new AppError("Invalid user role", 403);
}
