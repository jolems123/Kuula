import { Prisma, type Transaction } from "@prisma/client";

interface JournalLine {
  accountCode: string;
  direction: "debit" | "credit";
  amount: bigint;
}

/**
 * How a confirmed repayment is split. Policy: interest is settled first, then principal;
 * anything beyond the loan's balance is held as unapplied customer funds for refund or
 * a later decision. No penalty or fee income is charged to borrowers.
 */
export interface RepaymentAllocation {
  interest: bigint;
  principal: bigint;
  unapplied: bigint;
}

export function allocateRepayment(input: { payment: number; loanInterest: number; loanTotal: number; paidBefore: number }): RepaymentAllocation {
  const payment = Math.max(0, Math.round(input.payment));
  const outstanding = Math.max(0, Math.round(input.loanTotal - input.paidBefore));
  const applied = Math.min(payment, outstanding);
  const interestDue = Math.max(0, Math.round(input.loanInterest) - Math.min(Math.round(input.paidBefore), Math.round(input.loanInterest)));
  const interest = Math.min(applied, interestDue);
  return { interest: BigInt(interest), principal: BigInt(applied - interest), unapplied: BigInt(payment - applied) };
}

export type RefundSourceAccount = "UNAPPLIED_CUSTOMER_FUNDS" | "LOAN_COLLECTIONS_SUSPENSE";

type SettlementSource = Pick<Transaction, "type" | "amount"> & {
  providerFee?: bigint | null;
  allocation?: RepaymentAllocation | null;
  refundSourceAccount?: RefundSourceAccount | null;
};

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
  if (transaction.type === "customer_refund") {
    // Money held for the customer leaves the wallet; MarzPay's charge is Kuula's cost.
    if (!transaction.refundSourceAccount) throw new Error("A refund journal needs the account the money was held in");
    return [
      { accountCode: transaction.refundSourceAccount, direction: "debit", amount: transaction.amount },
      ...feeLine,
      { accountCode: "MOBILE_MONEY_CLEARING", direction: "credit", amount: transaction.amount + fee },
    ];
  }
  if (transaction.type === "loan_payment") {
    if (fee >= transaction.amount) throw new Error("Provider fee cannot equal or exceed the collected amount");
    const debits: JournalLine[] = [{ accountCode: "MOBILE_MONEY_CLEARING", direction: "debit", amount: transaction.amount - fee }, ...feeLine];
    const allocation = transaction.allocation;
    if (!allocation) {
      // Without a loan to apply it to, the money waits in suspense for a person to decide.
      return [...debits, { accountCode: "LOAN_COLLECTIONS_SUSPENSE", direction: "credit", amount: transaction.amount }];
    }
    if (allocation.interest + allocation.principal + allocation.unapplied !== transaction.amount) {
      throw new Error("Repayment allocation does not equal the collected amount");
    }
    const credits: JournalLine[] = [
      { accountCode: "LOAN_PRINCIPAL_RECEIVABLE", direction: "credit", amount: allocation.principal },
      { accountCode: "INTEREST_INCOME", direction: "credit", amount: allocation.interest },
      { accountCode: "UNAPPLIED_CUSTOMER_FUNDS", direction: "credit", amount: allocation.unapplied },
    ];
    return [...debits, ...credits.filter((line) => line.amount > BigInt(0))];
  }
  return [];
}

export async function postSettlementJournal(
  tx: Prisma.TransactionClient,
  transaction: Pick<Transaction, "id" | "type" | "amount" | "reference" | "userId" | "loanId"> & SettlementSource
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
  const description = transaction.type === "customer_refund" ? "Provider-confirmed customer refund"
    : isDisbursement ? "Provider-confirmed loan disbursement" : "Provider-confirmed loan repayment collection";
  await tx.journal.create({
    data: {
      transactionId: transaction.id,
      reference: transaction.reference,
      description,
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
