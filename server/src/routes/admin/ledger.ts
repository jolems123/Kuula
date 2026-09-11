/**
 * Admin → Ledger (transactions + savings).
 *
 * Read-only. The `transactions` table is the authoritative money ledger and
 * only verified provider callbacks may change a row's status, so there is no
 * edit or delete here by design.
 */
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  parsePage, paged, queryStr, requireUuid, isUuid, parseRange, rangeWhere, num,
  mapTransaction, mapApplication, mapRepayment,
} from "./shared.js";

const router = Router();

const TX_TYPES = ["loan_disbursement", "loan_payment", "savings_deposit", "savings_withdrawal"];
const TX_STATUSES = ["pending", "completed", "failed"];

function transactionWhere(req: Request) {
  const where: any = {};
  const type = queryStr(req, "type");
  const status = queryStr(req, "status");
  const q = queryStr(req, "q");
  const range = parseRange(req, "all");

  if (type && type !== "all") {
    if (type === "savings") where.type = { in: ["savings_deposit", "savings_withdrawal"] };
    else if (type === "loans") where.type = { in: ["loan_disbursement", "loan_payment"] };
    else if (TX_TYPES.includes(type)) where.type = type;
    else throw new AppError("Unknown transaction type filter", 400);
  }
  if (status && status !== "all") {
    if (status === "attention") where.status = { in: ["pending", "failed"] };
    else if (TX_STATUSES.includes(status)) where.status = status;
    else throw new AppError("Unknown transaction status filter", 400);
  }
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { providerRef: { contains: q, mode: "insensitive" } },
      { transactionId: { contains: q, mode: "insensitive" } },
      { loanId: { contains: q } },
      { user: { fullName: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      ...(isUuid(q) ? [{ id: q }, { userId: q }] : []),
    ];
  }
  Object.assign(where, rangeWhere(range) ?? {});
  return { where, range };
}

// GET /api/admin/transactions
router.get("/transactions", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const { where, range } = transactionWhere(req);

  const [rows, total, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
      include: { user: { select: { fullName: true, phone: true } } },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { amount: true } }),
  ]);

  res.json({
    ...paged(rows.map(mapTransaction), total, page),
    range: { preset: range.preset, from: range.from, to: range.to, label: range.label },
    totals: Object.fromEntries(sums.map((s) => [s.status, { count: s._count._all, amount: num(s._sum.amount) }])),
  });
});

// GET /api/admin/transactions/:id
router.get("/transactions/:id", async (req: Request, res: Response) => {
  const id = requireUuid(String(req.params.id), "transaction id");
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
  });
  if (!tx) throw new AppError("Transaction not found", 404);

  const [loan, repayment, webhookEvents] = await Promise.all([
    tx.loanId ? prisma.loanApplication.findFirst({ where: { loanId: tx.loanId } }) : Promise.resolve(null),
    tx.repaymentId ? prisma.repayment.findUnique({ where: { id: tx.repaymentId } }) : Promise.resolve(null),
    tx.reference || tx.providerRef
      ? prisma.webhookEvent.findMany({
          where: {
            OR: [
              ...(tx.reference ? [{ reference: tx.reference }] : []),
              ...(tx.providerRef ? [{ providerRef: tx.providerRef }] : []),
            ],
          },
          orderBy: { receivedAt: "desc" },
          select: { id: true, eventType: true, status: true, result: true, receivedAt: true, processedAt: true },
        })
      : Promise.resolve([]),
  ]);

  res.json({
    transaction: mapTransaction(tx),
    customer: tx.user,
    loan: loan ? mapApplication(loan) : null,
    repayment: repayment ? mapRepayment(repayment) : null,
    webhookEvents,
  });
});

// GET /api/admin/savings/accounts
router.get("/savings/accounts", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const q = queryStr(req, "q");
  const where: any = { user: { role: "user" } };
  if (q) {
    where.user = {
      role: "user",
      OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    };
  }

  const [rows, total, aggregate] = await Promise.all([
    prisma.savingsAccount.findMany({
      where,
      orderBy: { balance: "desc" },
      skip: page.skip,
      take: page.take,
      include: { user: { select: { id: true, fullName: true, phone: true, deletedAt: true } } },
    }),
    prisma.savingsAccount.count({ where }),
    prisma.savingsAccount.aggregate({ where: { user: { role: "user" } }, _sum: { balance: true }, _count: { _all: true } }),
  ]);

  // Ledger-derived balances for the page, so a drift between the account
  // balance and the transaction history is visible rather than hidden.
  const userIds = rows.map((r) => r.userId);
  const ledger = userIds.length
    ? await prisma.transaction.groupBy({
        by: ["userId", "type"],
        where: { userId: { in: userIds }, status: "completed", type: { in: ["savings_deposit", "savings_withdrawal"] } },
        _sum: { amount: true },
      })
    : [];
  const ledgerByUser = new Map<string, number>();
  for (const l of ledger) {
    const sign = l.type === "savings_deposit" ? 1 : -1;
    ledgerByUser.set(l.userId, (ledgerByUser.get(l.userId) ?? 0) + sign * num(l._sum.amount));
  }

  res.json({
    ...paged(
      rows.map((a) => {
        const balance = num(a.balance);
        const ledgerBalance = ledgerByUser.get(a.userId) ?? 0;
        return {
          userId: a.userId,
          fullName: a.user.fullName,
          phone: a.user.phone,
          active: !a.user.deletedAt,
          balance,
          ledgerBalance,
          reconciled: balance === ledgerBalance,
          updatedAt: a.updatedAt,
        };
      }),
      total,
      page
    ),
    totalBalance: num(aggregate._sum.balance),
    accounts: aggregate._count._all,
  });
});

// GET /api/admin/savings/transactions
router.get("/savings/transactions", async (req: Request, res: Response) => {
  const page = parsePage(req);
  const type = queryStr(req, "type");
  const q = queryStr(req, "q");
  const where: any = { type: { in: ["savings_deposit", "savings_withdrawal"] } };
  if (type === "savings_deposit" || type === "savings_withdrawal") where.type = type;
  if (q) {
    where.OR = [
      { user: { fullName: { contains: q, mode: "insensitive" } } },
      { user: { phone: { contains: q } } },
      ...(isUuid(q) ? [{ userId: q }] : []),
    ];
  }
  Object.assign(where, rangeWhere(parseRange(req, "all")) ?? {});

  const [rows, total, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take,
      include: { user: { select: { fullName: true, phone: true } } },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["type"], where: { ...where, status: "completed" }, _sum: { amount: true } }),
  ]);

  res.json({
    ...paged(rows.map(mapTransaction), total, page),
    totals: Object.fromEntries(sums.map((s) => [s.type, num(s._sum.amount)])),
  });
});

export default router;
