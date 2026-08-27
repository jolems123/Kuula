import { Router, Request, Response, NextFunction } from "express";

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  // Railway's internal health checker reaches the container over HTTP after
  // TLS has already terminated at the platform edge. Keep both liveness and
  // readiness probes outside the public HTTPS enforcement middleware.
  if (process.env.NODE_ENV !== "production" || req.path === "/health" || req.path === "/ready") {
    next();
    return;
  }
  if (!req.secure) {
    res.status(426).json({ error: "HTTPS is required" });
    return;
  }
  next();
});

export default router;
