/**
 * Lightweight cross-screen selection store. The app router navigates with a
 * plain screen key (no params), so screens that need to carry a specific record
 * (a tapped transaction, a just-initiated payment) stash it here and the target
 * screen reads it on mount. Ephemeral by design — not persisted.
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

export function setSelectedTransaction(txn: SelectedTransaction | null): void {
  _selectedTransaction = txn;
}

export function getSelectedTransaction(): SelectedTransaction | null {
  return _selectedTransaction;
}

export interface PaymentResult {
  amount: number;
  reference: string;
  method: string;
  status: string;
  dateISO: string;
}

let _lastPayment: PaymentResult | null = null;

export function setLastPayment(p: PaymentResult | null): void {
  _lastPayment = p;
}

export function getLastPayment(): PaymentResult | null {
  return _lastPayment;
}

/** Clear all ephemeral selection state — call on logout to prevent stale data leaking into the next session. */
export function clearSelectionState(): void {
  _selectedTransaction = null;
  _lastPayment = null;
}
