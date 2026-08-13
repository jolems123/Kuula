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

export interface CreditUseSelection {
  productCode: string;
  productName: string;
  category: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  customerLimit: number;
  minTermDays: number;
  maxTermDays: number;
  partnerRequired: boolean;
  disbursementMode: string;
}
let _creditUseSelection: CreditUseSelection | null = null;
export function setCreditUseSelection(value: CreditUseSelection | null): void { _creditUseSelection = value; }
export function getCreditUseSelection(): CreditUseSelection | null { return _creditUseSelection; }

export interface PartnerSelection {
  partnerCode: string;
  partnerName: string;
  partnerType: string;
  locationId?: string | null;
  locationName?: string | null;
}
let _partnerSelection: PartnerSelection | null = null;
export function setPartnerSelection(value: PartnerSelection | null): void { _partnerSelection = value; }
export function getPartnerSelection(): PartnerSelection | null { return _partnerSelection; }

export interface AdminMfaChallenge {
  challengeToken: string;
  destination: string;
}
let _adminMfaChallenge: AdminMfaChallenge | null = null;
export function setAdminMfaChallenge(value: AdminMfaChallenge | null): void { _adminMfaChallenge = value; }
export function getAdminMfaChallenge(): AdminMfaChallenge | null { return _adminMfaChallenge; }

export interface CreditOperationsSelection {
  applicationId: string;
  applicantName?: string;
  customerId?: string;
}
let _creditOperationsSelection: CreditOperationsSelection | null = null;
export function setCreditOperationsSelection(value: CreditOperationsSelection | null): void { _creditOperationsSelection = value; }
export function getCreditOperationsSelection(): CreditOperationsSelection | null { return _creditOperationsSelection; }

let _customer360Id: string | null = null;
export function setCustomer360Id(value: string | null): void { _customer360Id = value; }
export function getCustomer360Id(): string | null { return _customer360Id; }

export function clearSelectionState(): void {
  _selectedTransaction = null;
  _lastPayment = null;
  _loanDraft = null;
  _creditUseSelection = null;
  _partnerSelection = null;
  _adminMfaChallenge = null;
  _creditOperationsSelection = null;
  _customer360Id = null;
}
