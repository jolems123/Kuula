import { Prisma, type Transaction } from "@prisma/client";

interface JournalLine {
  accountCode: string;
  direction: "debit" | "credit";
  amount: bigint;
}

function linesFor(transaction: Pick<Transaction, "type" | "amount">): JournalLine[] {
  if (transaction.type === "loan_disbursement" || transaction.type === "loan_disbursement_leg") {
    return [
      { accountCode: "LOAN_PRINCIPAL_RECEIVABLE", direction: "debit", amount: transaction.amount },
      { accountCode: "MOBILE_MONEY_CLEARING", direction: "credit", amount: transaction.amount },
    ];
  }
  if (transaction.type === "loan_payment") {
    return [
      { accountCode: "MOBILE_MONEY_CLEARING", direction: "debit", amount: transaction.amount },
      { accountCode: "LOAN_COLLECTIONS_SUSPENSE", direction: "credit", amount: transaction.amount },
    ];
  }
  return [];
}

export async function postSettlementJournal(
  tx: Prisma.TransactionClient,
  transaction: Pick<Transaction, "id" | "type" | "amount" | "reference" | "userId" | "loanId">
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
