/**
 * Normalises what staff type next to the fixed "+256" prefix.
 * Accepts 0700…, 700…, 256700… or +256700… and returns "+256700…"; "" when empty.
 */
export function toUgandaPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("256")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits ? `+256${digits}` : "";
}
