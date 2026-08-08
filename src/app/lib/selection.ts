/**
 * Lightweight cross-screen selection store. Sensitive workflow state is kept in
 * memory only and is cleared on logout; it is never persisted to browser storage.
 */

export interface SelectedTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: string;
}

let _selectedTransaction: SelectedTransaction | null = null;
export function setSelectedTransaction(txn: SelectedTransaction | null): void { _selectedTransaction = txn; }
export function getSelectedTransaction(): SelectedTransaction | null { return _selectedTransaction; }

export interface PaymentResult {
  amount: number;
  reference: string;
  method: string;
  status: string;
  dateISO: string;
}
let _lastPayment: PaymentResult | null = null;
export function setLastPayment(p: PaymentResult | null): void { _lastPayment = p; }
export function getLastPayment(): PaymentResult | null { return _lastPayment; }

export interface LoanDraft {
  amount: number;
  termDays: number;
  purpose: string;
  channel: string;
  declaredMonthlyIncome: number;
  declaredMonthlyExpenses: number;
  existingDebtPayment: number;
}
let _loanDraft: LoanDraft | null = null;
export function setLoanDraft(value: LoanDraft | null): void { _loanDraft = value; }
export function getLoanDraft(): LoanDraft | null { return _loanDraft; }

export interface AdminMfaChallenge {
  challengeToken: string;
  destination: string;
}
let _adminMfaChallenge: AdminMfaChallenge | null = null;
export function setAdminMfaChallenge(value: AdminMfaChallenge | null): void { _adminMfaChallenge = value; }
export function getAdminMfaChallenge(): AdminMfaChallenge | null { return _adminMfaChallenge; }

export function clearSelectionState(): void {
  _selectedTransaction = null;
  _lastPayment = null;
  _loanDraft = null;
  _adminMfaChallenge = null;
}
