import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticateToken } from "../middleware/auth.js";
import { AppError } from "../middleware/error-handler.js";
import { effectiveCreditEvidence } from "../lib/credit-evidence.js";
import { computeCreditScore } from "../lib/credit-score.js";
import { writeAuditEvent } from "../lib/audit.js";

const router = Router();
const OPEN_FINANCING_STATUSES = ["pending", "resubmitted", "offered", "disbursing", "active", "overdue"];

function scoreLimit(score: number): number {
  if (score >= 750) return 2_000_000;
  if (score >= 700) return 1_000_000;
  if (score >= 600) return 500_000;
  if (score >= 500) return 200_000;
  return 0;
}

function number(value: bigint | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

async function marketOrThrow(code: string) {
  const market = await prisma.market.findUnique({ where: { code } });
  if (!market || market.status !== "active") throw new AppError("This Kuula market is not active", 404);
  return market;
}

async function refreshNetworkProfile(userId: string, marketCode = "UG") {
  const [user, market, evidence, openApplication, activeRepayment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    marketOrThrow(marketCode),
    effectiveCreditEvidence(userId),
    prisma.loanApplication.findFirst({
      where: { applicantId: userId, status: { in: OPEN_FINANCING_STATUSES } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.repayment.findFirst({
      where: { userId, status: { not: "paid" } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  if (!user || user.deletedAt) throw new AppError("User not found", 404);

  const credit = computeCreditScore({
    momoMonths: evidence.momoMonths,
    momoTxnCount: evidence.momoTxnCount,
    crbStatus: evidence.crbStatus,
    kycVerified: user.kycVerified,
    loansRepaid: user.loansRepaid,
    loansTotal: user.loansTotal,
  });

  const identityReady = user.phoneVerified && user.kycVerified;
  const evidenceReady = evidence.momoVerified && evidence.crbVerified;
  const baseLimit = identityReady && evidenceReady ? scoreLimit(credit.score) : 0;
  // Until Kuula supports multiple simultaneous facilities, an open facility uses
  // the customer's Growth Line. The total line remains visible while available
  // capacity is zero, making the policy explicit rather than implying cash is available.
  const availableLimit = openApplication ? 0 : baseLimit;
  const status = !identityReady
    ? "identity_required"
    : !evidenceReady
      ? "data_required"
      : openApplication
        ? "in_use"
        : baseLimit > 0
          ? "available"
          : "building";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 86_400_000);

  const growthLine = await prisma.growthLine.upsert({
    where: { userId },
    update: {
      marketCode,
      totalLimit: BigInt(baseLimit),
      availableLimit: BigInt(availableLimit),
      status,
      reviewedAt: now,
      expiresAt,
      rationale: {
        identityReady,
        evidenceReady,
        score: credit.score,
        openFacility: !!openApplication,
        policy: "single-open-facility",
      },
    },
    create: {
      userId,
      marketCode,
      totalLimit: BigInt(baseLimit),
      availableLimit: BigInt(availableLimit),
      status,
      reviewedAt: now,
      expiresAt,
      rationale: {
        identityReady,
        evidenceReady,
        score: credit.score,
        openFacility: !!openApplication,
        policy: "single-open-facility",
      },
    },
  });

  const repaymentRate = user.loansTotal > 0
    ? Math.round((user.loansRepaid / user.loansTotal) * 10_000) / 100
    : 0;
  const signals = {
    identityVerified: identityReady,
    phoneVerified: user.phoneVerified,
    kycVerified: user.kycVerified,
    mobileMoneyEvidence: evidence.momoVerified,
    crbEvidence: evidence.crbVerified,
    mobileMoneyMonths: evidence.momoMonths,
    mobileMoneyTransactions: evidence.momoTxnCount,
    crbStatus: evidence.crbStatus,
    loansRepaid: user.loansRepaid,
    loansTotal: user.loansTotal,
  };

  const latestPass = await prisma.creditPassSnapshot.findFirst({
    where: { userId, marketCode },
    orderBy: { createdAt: "desc" },
  });
  const shouldSnapshot = !latestPass
    || latestPass.score !== credit.score
    || number(latestPass.availableLimit) !== availableLimit
    || latestPass.kycLevel !== (user.kycVerified ? "verified" : "unverified")
    || latestPass.createdAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000;

  const pass = shouldSnapshot
    ? await prisma.creditPassSnapshot.create({
        data: {
          userId,
          marketCode,
          score: credit.score,
          tier: credit.tier,
          kycLevel: user.kycVerified ? "verified" : "unverified",
          repaymentRate,
          availableLimit: BigInt(availableLimit),
          signals,
        },
      })
    : latestPass;

  return {
    market,
    user,
    credit,
    evidence,
    growthLine,
    creditPass: pass!,
    openApplication,
    activeRepayment,
  };
}

function mapProduct(product: any, growthLineLimit?: number) {
  const maxAmount = number(product.maxAmount);
  return {
    id: product.id,
    code: product.code,
    marketCode: product.marketCode,
    name: product.name,
    category: product.category,
    purposeType: product.purposeType,
    description: product.description,
    minAmount: number(product.minAmount),
    maxAmount,
    customerLimit: growthLineLimit == null ? maxAmount : Math.min(maxAmount, growthLineLimit),
    minTermDays: product.minTermDays,
    maxTermDays: product.maxTermDays,
    disbursementMode: product.disbursementMode,
    partnerRequired: product.partnerRequired,
    status: product.status,
    metadata: product.metadata,
  };
}

function mapPartner(partner: any) {
  return {
    id: partner.id,
    code: partner.code,
    marketCode: partner.marketCode,
    name: partner.name,
    partnerType: partner.partnerType,
    settlementMode: partner.settlementMode,
    metadata: partner.metadata,
    locations: (partner.locations ?? []).map((location: any) => ({
      id: location.id,
      name: location.name,
      district: location.district,
      country: location.country,
      phone: location.phone,
      metadata: location.metadata,
    })),
  };
}

router.get("/markets", async (_req: Request, res: Response) => {
  const markets = await prisma.market.findMany({
    where: { status: { in: ["active", "planned"] } },
    orderBy: [{ status: "asc" }, { countryName: "asc" }],
  });
  res.json({
    markets: markets.map((market) => ({
      code: market.code,
      countryName: market.countryName,
      currency: market.currency,
      dialingCode: market.dialingCode,
      defaultLocale: market.defaultLocale,
      status: market.status,
    })),
  });
});

router.get("/products", authenticateToken, async (req: Request, res: Response) => {
  const marketCode = String(req.query.market ?? "UG").toUpperCase();
  const profile = await refreshNetworkProfile(req.user!.userId, marketCode);
  const products = await prisma.creditProduct.findMany({
    where: { marketCode, status: "active" },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ products: products.map((product) => mapProduct(product, number(profile.growthLine.availableLimit))) });
});

router.get("/partners", authenticateToken, async (req: Request, res: Response) => {
  const marketCode = String(req.query.market ?? "UG").toUpperCase();
  await marketOrThrow(marketCode);
  const partnerType = typeof req.query.type === "string" ? req.query.type : undefined;
  const partners = await prisma.partner.findMany({
    where: { marketCode, status: "active", ...(partnerType ? { partnerType } : {}) },
    include: { locations: { where: { active: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  res.json({ partners: partners.map(mapPartner) });
});

router.get("/growth-line", authenticateToken, async (req: Request, res: Response) => {
  const marketCode = String(req.query.market ?? "UG").toUpperCase();
  const profile = await refreshNetworkProfile(req.user!.userId, marketCode);
  res.json({
    growthLine: {
      totalLimit: number(profile.growthLine.totalLimit),
      availableLimit: number(profile.growthLine.availableLimit),
      status: profile.growthLine.status,
      reviewedAt: profile.growthLine.reviewedAt,
      expiresAt: profile.growthLine.expiresAt,
    },
  });
});

router.get("/credit-pass", authenticateToken, async (req: Request, res: Response) => {
  const marketCode = String(req.query.market ?? "UG").toUpperCase();
  const profile = await refreshNetworkProfile(req.user!.userId, marketCode);
  res.json({
    creditPass: {
      score: profile.credit.score,
      maxScore: profile.credit.maxScore,
      tier: profile.credit.tier,
      percentile: profile.credit.percentile,
      kycLevel: profile.creditPass.kycLevel,
      repaymentRate: Number(profile.creditPass.repaymentRate),
      availableLimit: number(profile.creditPass.availableLimit),
      signals: profile.creditPass.signals,
      updatedAt: profile.creditPass.createdAt,
    },
  });
});

router.get("/overview", authenticateToken, async (req: Request, res: Response) => {
  const marketCode = String(req.query.market ?? "UG").toUpperCase();
  const profile = await refreshNetworkProfile(req.user!.userId, marketCode);
  const [products, partners, requests] = await Promise.all([
    prisma.creditProduct.findMany({ where: { marketCode, status: "active" }, orderBy: { category: "asc" } }),
    prisma.partner.findMany({ where: { marketCode, status: "active" }, include: { locations: { where: { active: true }, take: 3 } }, orderBy: { name: "asc" } }),
    prisma.partnerFinancingRequest.findMany({ where: { userId: req.user!.userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  res.json({
    market: {
      code: profile.market.code,
      countryName: profile.market.countryName,
      currency: profile.market.currency,
      dialingCode: profile.market.dialingCode,
    },
    growthLine: {
      totalLimit: number(profile.growthLine.totalLimit),
      availableLimit: number(profile.growthLine.availableLimit),
      status: profile.growthLine.status,
      reviewedAt: profile.growthLine.reviewedAt,
      expiresAt: profile.growthLine.expiresAt,
    },
    creditPass: {
      score: profile.credit.score,
      maxScore: profile.credit.maxScore,
      tier: profile.credit.tier,
      percentile: profile.credit.percentile,
      kycLevel: profile.creditPass.kycLevel,
      repaymentRate: Number(profile.creditPass.repaymentRate),
      signals: profile.creditPass.signals,
      updatedAt: profile.creditPass.createdAt,
    },
    products: products.map((product) => mapProduct(product, number(profile.growthLine.availableLimit))),
    partners: partners.map(mapPartner),
    activeFinancing: profile.openApplication ? {
      id: profile.openApplication.id,
      purpose: profile.openApplication.purpose,
      amount: number(profile.openApplication.amount),
      total: number(profile.openApplication.total),
      status: profile.openApplication.status,
      dueDate: profile.openApplication.dueDate,
    } : null,
    nextPayment: profile.activeRepayment ? {
      amount: Math.max(0, number(profile.activeRepayment.total) - number(profile.activeRepayment.amountPaid)),
      dueDate: profile.activeRepayment.dueDate,
      status: profile.activeRepayment.status,
    } : null,
    recentPartnerRequests: requests.map((request) => ({
      id: request.id,
      purpose: request.purpose,
      amount: number(request.amount),
      status: request.status,
      createdAt: request.createdAt,
    })),
  });
});

router.get("/partner-financing", authenticateToken, async (req: Request, res: Response) => {
  const requests = await prisma.partnerFinancingRequest.findMany({
    where: { userId: req.user!.userId },
    include: { partner: true, product: true, partnerLocation: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    requests: requests.map((request) => ({
      id: request.id,
      partner: request.partner.name,
      partnerLocation: request.partnerLocation?.name ?? null,
      product: request.product.name,
      purpose: request.purpose,
      amount: number(request.amount),
      status: request.status,
      invoiceReference: request.invoiceReference,
      createdAt: request.createdAt,
    })),
  });
});

router.post("/partner-financing", authenticateToken, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const marketCode = String(req.body?.marketCode ?? "UG").toUpperCase();
  const productCode = String(req.body?.productCode ?? "").trim();
  const partnerCode = String(req.body?.partnerCode ?? "").trim();
  const partnerLocationId = req.body?.partnerLocationId ? String(req.body.partnerLocationId) : null;
  const invoiceReference = String(req.body?.invoiceReference ?? "").trim();
  const purpose = String(req.body?.purpose ?? "").trim();
  const amount = Math.round(Number(req.body?.amount));
  const externalReference = req.body?.externalReference ? String(req.body.externalReference).trim() : null;

  if (!productCode || !partnerCode || !purpose || !invoiceReference) {
    throw new AppError("Product, partner, purpose and invoice/order reference are required", 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("A valid financing amount is required", 400);

  const profile = await refreshNetworkProfile(userId, marketCode);
  if (profile.growthLine.status !== "available" || number(profile.growthLine.availableLimit) <= 0) {
    throw new AppError("Your Kuula Growth Line is not currently available for a new financing request", 409);
  }

  const [product, partner] = await Promise.all([
    prisma.creditProduct.findUnique({ where: { code: productCode } }),
    prisma.partner.findUnique({ where: { code: partnerCode }, include: { locations: true } }),
  ]);
  if (!product || product.status !== "active" || product.marketCode !== marketCode) throw new AppError("Credit product is unavailable", 404);
  if (!partner || partner.status !== "active" || partner.marketCode !== marketCode) throw new AppError("Partner is unavailable", 404);
  if (!product.partnerRequired || product.disbursementMode !== "direct_payee") {
    throw new AppError("This endpoint is only for restricted-purpose direct-payee financing", 400);
  }
  if (amount < number(product.minAmount) || amount > number(product.maxAmount)) {
    throw new AppError(`Amount must be between ${number(product.minAmount)} and ${number(product.maxAmount)}`, 400);
  }
  if (amount > number(profile.growthLine.availableLimit)) {
    throw new AppError("Requested amount exceeds your available Kuula Growth Line", 400);
  }

  let location = null;
  if (partnerLocationId) {
    location = partner.locations.find((entry) => entry.id === partnerLocationId && entry.active) ?? null;
    if (!location) throw new AppError("Partner location is unavailable", 404);
  }

  try {
    const request = await prisma.partnerFinancingRequest.create({
      data: {
        userId,
        marketCode,
        partnerId: partner.id,
        partnerLocationId: location?.id ?? null,
        productId: product.id,
        externalReference,
        invoiceReference,
        purpose,
        amount: BigInt(amount),
        status: "pending_review",
        payeeName: location?.name ?? partner.name,
        payeeReference: location?.externalReference ?? partner.code,
        metadata: {
          directPayeeRequired: true,
          disbursementMode: product.disbursementMode,
          source: "kuula-app",
        },
      },
    });
    await writeAuditEvent({
      actorId: userId,
      subjectUserId: userId,
      action: "partner_financing.submitted",
      resourceType: "partner_financing_request",
      resourceId: request.id,
      metadata: { productCode, partnerCode, amount, invoiceReference },
    });
    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        amount,
        partner: partner.name,
        product: product.name,
        message: "Request received. Kuula will verify the invoice/order and approved payee before any money can move.",
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002" && externalReference) throw new AppError("This partner request was already submitted", 409);
    throw error;
  }
});

export default router;
