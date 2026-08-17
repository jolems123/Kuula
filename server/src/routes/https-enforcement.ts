import { Router, Request, Response, NextFunction } from "express";

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== "production" || req.path === "/health") {
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
