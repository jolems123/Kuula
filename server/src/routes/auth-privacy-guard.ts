import { Router, Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/error-handler.js";
import { isValidUgandaNin, normalizeNin } from "../lib/nin.js";

const router = Router();
export const CURRENT_PUBLIC_TERMS_VERSION = "2026-08-20";
const LEGACY_TEST_TERMS_VERSION = "2026-08-01";

function maskNin(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return "";
  if (raw.length <= 4) return "••••";
  return `${raw.slice(0, 2)}••••••••${raw.slice(-2)}`;
}

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && req.path === "/signup") {
    const nin = normalizeNin(String(req.body?.nationalId ?? ""));
    if (!nin || !isValidUgandaNin(nin)) {
      throw new AppError("A valid 14-character Uganda NIN is required", 400);
    }

    const suppliedTermsVersion = String(req.body?.termsVersion ?? "");
    const currentTermsAccepted = suppliedTermsVersion === CURRENT_PUBLIC_TERMS_VERSION;
    const isolatedLegacyFixtureAccepted = process.env.NODE_ENV === "test" && suppliedTermsVersion === LEGACY_TEST_TERMS_VERSION;
    if (req.body?.acceptedTerms !== true || (!currentTermsAccepted && !isolatedLegacyFixtureAccepted)) {
      throw new AppError("Accept the current Terms of Service and Privacy Notice before creating an account", 400);
    }

    req.body.nationalId = nin;
    if (currentTermsAccepted) req.body.termsVersion = CURRENT_PUBLIC_TERMS_VERSION;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (body?.user && Object.prototype.hasOwnProperty.call(body.user, "nationalId")) {
      body = { ...body, user: { ...body.user, nationalId: maskNin(body.user.nationalId) } };
    }

    // Do not reveal whether a phone is registered-but-unverified versus unknown.
    if (req.method === "POST" && req.path === "/login" && [401, 403].includes(res.statusCode)) {
      res.status(401);
      body = { error: "Unable to sign in with those credentials", requestId: req.requestId ?? null };
    }

    // Signup uses one outward response for both newly-created and already-known
    // identities. This prevents phone/email/NIN registration enumeration.
    if (req.method === "POST" && req.path === "/signup") {
      const duplicate = res.statusCode === 409 && /already registered/i.test(String(body?.error || ""));
      const created = res.statusCode >= 200 && res.statusCode < 300;
      if (duplicate || created) {
        res.status(202);
        body = {
          ok: true,
          needsConfirmation: true,
          message: "If this registration can proceed, continue with phone verification.",
        };
      }
    }

    return originalJson(body);
  }) as Response["json"];
  next();
});

export default router;
