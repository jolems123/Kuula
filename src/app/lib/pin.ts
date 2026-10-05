/** Customer login PIN rules. Mirrors `validateNewPin` on the server. */
export const PIN_LENGTH = 6;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

/** Returns a message the customer can act on, or "" when the PIN is acceptable. */
export function newPinProblem(pin: string): string {
  if (!/^\d{6}$/.test(pin)) return "Choose a PIN of exactly 6 digits.";
  if (/^(\d)\1{5}$/.test(pin) || "0123456789012345".includes(pin) || "9876543210987654".includes(pin)) {
    return "That PIN is too easy to guess. Avoid repeated or counting digits.";
  }
  return "";
}
