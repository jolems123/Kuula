/**
 * The three credit-approval levels and which staff roles may work each one. Legacy
 * roles (officer/manager/admin) remain valid for existing accounts; staff invited
 * through the app get the dedicated roles.
 */
export const LEVEL_ROLES: Record<1 | 2 | 3, readonly string[]> = {
  1: ["loan_officer", "officer"],
  2: ["credit_manager", "manager"],
  3: ["final_approver", "administrator", "super_admin", "admin"],
};

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "loan officer",
  2: "credit manager",
  3: "final approver",
};

function asLevel(level: number): 1 | 2 | 3 {
  if (level === 1 || level === 2 || level === 3) return level;
  throw new RangeError(`Unknown credit approval level ${level}`);
}

export function roleLevel(role: string): number {
  const normalized = String(role || "").toLowerCase().trim();
  for (const level of [1, 2, 3] as const) if (LEVEL_ROLES[level].includes(normalized)) return level;
  return 0;
}

export function roleFitsLevel(role: string | null | undefined, level: number): boolean {
  return LEVEL_ROLES[asLevel(level)].includes(String(role || "").toLowerCase().trim());
}

export function levelLabel(level: number): string {
  return LEVEL_LABEL[asLevel(level)];
}

/** Staff roles that belong to a level, accepting either a level number or any role name of that level. */
export function rolesForLevelQuery(requested: string): readonly string[] | null {
  const value = requested.toLowerCase().trim();
  if (!value) return [...LEVEL_ROLES[1], ...LEVEL_ROLES[2], ...LEVEL_ROLES[3]];
  if (["1", "2", "3"].includes(value)) return LEVEL_ROLES[Number(value) as 1 | 2 | 3];
  const level = roleLevel(value);
  return level ? LEVEL_ROLES[level as 1 | 2 | 3] : null;
}
