import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { createPartnerFinancingApplication } from "../lib/partner-financing.js";

const router = Router();

function text(value: unknown, label: string, max = 180): string {
  const result = String(value ?? "").trim().slice(0, max);
  if (!result) throw new AppError(`${label} is required`, 400);
  return result;
}

router.post("/partner-financing", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const marketCode = String(req.body?.marketCode ?? "UG").trim().toUpperCase().slice(0, 3);
  const productCode = text(req.body?.productCode, "Credit product", 80);
  const partnerCode = text(req.body?.partnerCode, "Partner", 80);
  const invoiceReference = text(req.body?.invoiceReference, "Invoice/order reference", 160);
  const purpose = text(req.body?.purpose, "Financing purpose", 240);
  const partnerLocationId = req.body?.partnerLocationId ? String(req.body.partnerLocationId).trim() : null;
  const externalReference = req.body?.externalReference ? String(req.body.externalReference).trim().slice(0, 180) : null;
  const amount = Math.round(Number(req.body?.amount));
  const termDays = Math.round(Number(req.body?.termDays));
  const declaredMonthlyIncome = Math.round(Number(req.body?.declaredMonthlyIncome));
  const declaredMonthlyExpenses = Math.round(Number(req.body?.declaredMonthlyExpenses));
  const existingDebtPayment = Math.round(Number(req.body?.existingDebtPayment ?? 0));

  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("A valid financing amount is required", 400);
  if (!Number.isFinite(termDays) || termDays <= 0) throw new AppError("A valid financing term is required", 400);

  const [market, product, partner] = await Promise.all([
    prisma.market.findUnique({ where: { code: marketCode } }),
    prisma.creditProduct.findUnique({ where: { code: productCode } }),
    prisma.partner.findUnique({ where: { code: partnerCode }, include: { locations: true } }),
  ]);
  if (!market || market.status !== "active") throw new AppError("This Kuula market is not active", 404);
  if (!product || product.marketCode !== marketCode || product.status !== "active") throw new AppError("Credit product is unavailable", 404);
  if (!product.partnerRequired || product.disbursementMode !== "direct_payee") throw new AppError("This endpoint is only for restricted-purpose direct-payee credit", 400);
  if (!partner || partner.marketCode !== marketCode || partner.status !== "active") throw new AppError("Partner is unavailable", 404);

  const productCodes = Array.isArray((partner.metadata as any)?.productCodes) ? (partner.metadata as any).productCodes.map(String) : [];
  if (productCodes.length > 0 && !productCodes.includes(product.code)) throw new AppError("Selected partner does not support this credit product", 400);
  if (amount < Number(product.minAmount) || amount > Number(product.maxAmount)) {
    throw new AppError(`Amount must be between ${Number(product.minAmount)} and ${Number(product.maxAmount)}`, 400);
  }

  const location = partnerLocationId
    ? partner.locations.find((entry) => entry.id === partnerLocationId && entry.active) ?? null
    : null;
  if (partnerLocationId && !location) throw new AppError("Partner location is unavailable", 404);

  const result = await createPartnerFinancingApplication({
    userId,
    marketCode,
    product,
    partner,
    location,
    amount,
    purpose,
    invoiceReference,
    externalReference,
    termDays,
    declaredMonthlyIncome,
    declaredMonthlyExpenses,
    existingDebtPayment,
  });

  res.status(201).json({
    request: {
      id: result.request.id,
      status: result.request.status,
      amount: Number(result.request.amount),
      partner: partner.name,
      partnerLocation: location?.name ?? null,
      product: product.name,
      applicationId: result.application.id,
      applicationStatus: result.application.status,
      underwritingStatus: result.underwriting.status,
      message: "Credit application created. Kuula will complete field/reviewer checks and verify the invoice and payee before an offer can be issued.",
    },
  });
});

export default router;
