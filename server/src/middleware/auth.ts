import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { AppError } from "./error-handler.js";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("Missing JWT_SECRET environment variable");
if (process.env.NODE_ENV === "production" && jwtSecret.length < 48) {
  throw new Error("JWT_SECRET must contain at least 48 characters in production");
}
const JWT_SECRET: string = jwtSecret;

export type UserRole = "admin" | "manager" | "officer" | "customer" | "user";
export type Permission =
  | "loan.review"
  | "loan.approve"
  | "kyc.review"
  | "kyc.document.view"
  | "report.view"
  | "customer.view"
  | "support.manage"
  | "credit_evidence.manage"
  | "reconciliation.manage"
  | "admin.manage";

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [
    "loan.review", "loan.approve", "kyc.review", "kyc.document.view", "report.view",
    "customer.view", "support.manage", "credit_evidence.manage", "reconciliation.manage", "admin.manage",
  ],
  manager: [
    "loan.review", "loan.approve", "kyc.review", "kyc.document.view", "report.view",
    "customer.view", "support.manage", "credit_evidence.manage", "reconciliation.manage",
  ],
  officer: ["loan.review", "kyc.review", "kyc.document.view", "customer.view", "support.manage"],
  customer: [],
  user: [],
};

export interface JwtPayload {
  userId: string;
  role: UserRole;
  authVersion: number;
  sessionId: string;
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
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "kuula-api",
    audience: "kuula-app",
  });
}

export function generateAdminChallenge(payload: { userId: string; authVersion: number }): string {
  return jwt.sign({ ...payload, purpose: "admin_login" }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "10m",
    issuer: "kuula-api",
    audience: "kuula-admin-mfa",
  });
}

export function verifyAdminChallenge(token: string): { userId: string; authVersion: number } {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: "kuula-api",
    audience: "kuula-admin-mfa",
  });
  if (typeof decoded !== "object" || decoded === null) throw new AppError("Invalid admin verification challenge", 401);
  const candidate = decoded as { userId?: unknown; authVersion?: unknown; purpose?: unknown };
  if (
    typeof candidate.userId !== "string"
    || !Number.isInteger(candidate.authVersion)
    || candidate.purpose !== "admin_login"
  ) {
    throw new AppError("Invalid admin verification challenge", 401);
  }
  return { userId: candidate.userId, authVersion: candidate.authVersion as number };
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
      algorithms: ["HS256"],
      issuer: "kuula-api",
      audience: "kuula-app",
    });
    if (typeof decoded !== "object" || decoded === null) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const candidate = decoded as Partial<JwtPayload>;
    if (
      !candidate.userId
      || !candidate.role
      || !candidate.sessionId
      || !Number.isInteger(candidate.authVersion)
    ) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    const [user, session] = await Promise.all([
      prisma.user.findUnique({
        where: { id: candidate.userId },
        select: { role: true, authVersion: true, deletedAt: true },
      }),
      prisma.authSession.findUnique({
        where: { id: candidate.sessionId },
        select: { userId: true, revokedAt: true, expiresAt: true },
      }),
    ]);
    if (!user || user.deletedAt || !session || session.userId !== candidate.userId) {
      res.status(401).json({ error: "Session is no longer valid" });
      return;
    }
    if (session.revokedAt || session.expiresAt <= new Date()) {
      res.status(401).json({ error: "Session has been revoked" });
      return;
    }

    const role = normalizeRole(user.role);
    if (role !== normalizeRole(candidate.role) || user.authVersion !== candidate.authVersion) {
      res.status(401).json({ error: "Session has been revoked" });
      return;
    }

    req.user = {
      userId: candidate.userId,
      role,
      authVersion: user.authVersion,
      sessionId: candidate.sessionId,
    };
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

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function requirePermissions(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!permissions.every((permission) => hasPermission(req.user!.role, permission))) {
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
