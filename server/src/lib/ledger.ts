import { Prisma, type Transaction } from "@prisma/client";

interface JournalLine {
  accountCode: string;
  direction: "debit" | "credit";
  amount: bigint;
}

type SettlementSource = Pick<Transaction, "type" | "amount"> & { providerFee?: bigint | null };

/**
 * MOBILE_MONEY_CLEARING mirrors Kuula's MarzPay wallet. MarzPay's own charges are kept
 * out of borrower balances and posted to PROVIDER_FEE_EXPENSE:
 * - a payout costs the wallet amount + charge, and the borrower owes only the amount;
 * - a collection credits the wallet amount - charge, and the borrower is credited in full.
 */
export function linesFor(transaction: SettlementSource): JournalLine[] {
  const fee = transaction.providerFee && transaction.providerFee > BigInt(0) ? transaction.providerFee : BigInt(0);
  const feeLine: JournalLine[] = fee > BigInt(0) ? [{ accountCode: "PROVIDER_FEE_EXPENSE", direction: "debit", amount: fee }] : [];
  if (transaction.type === "loan_disbursement" || transaction.type === "loan_disbursement_leg") {
    return [
      { accountCode: "LOAN_PRINCIPAL_RECEIVABLE", direction: "debit", amount: transaction.amount },
      ...feeLine,
      { accountCode: "MOBILE_MONEY_CLEARING", direction: "credit", amount: transaction.amount + fee },
    ];
  }
  if (transaction.type === "loan_payment") {
    if (fee >= transaction.amount) throw new Error("Provider fee cannot equal or exceed the collected amount");
    return [
      { accountCode: "MOBILE_MONEY_CLEARING", direction: "debit", amount: transaction.amount - fee },
      ...feeLine,
      { accountCode: "LOAN_COLLECTIONS_SUSPENSE", direction: "credit", amount: transaction.amount },
    ];
  }
  return [];
}

export async function postSettlementJournal(
  tx: Prisma.TransactionClient,
  transaction: Pick<Transaction, "id" | "type" | "amount" | "reference" | "userId" | "loanId"> & { providerFee?: bigint | null }
): Promise<void> {
  if (!transaction.reference) throw new Error("Settled transaction requires a reference");
  const lines = linesFor(transaction);
  if (lines.length === 0) return;

  const debit = lines.filter((line) => line.direction === "debit").reduce((sum, line) => sum + line.amount, BigInt(0));
  const credit = lines.filter((line) => line.direction === "credit").reduce((sum, line) => sum + line.amount, BigInt(0));
  if (debit !== credit || debit <= 0) throw new Error("Settlement journal is not balanced");

  const existing = await tx.journal.findUnique({ where: { transactionId: transaction.id }, select: { id: true } });
  if (existing) return;

  const isDisbursement = transaction.type === "loan_disbursement" || transaction.type === "loan_disbursement_leg";
  await tx.journal.create({
    data: {
      transactionId: transaction.id,
      reference: transaction.reference,
      description: isDisbursement ? "Provider-confirmed loan disbursement" : "Provider-confirmed loan repayment collection",
      entries: {
        create: lines.map((line) => ({
          accountCode: line.accountCode,
          direction: line.direction,
          amount: line.amount,
          userId: transaction.userId,
          loanId: transaction.loanId,
        })),
      },
    },
  });
}
