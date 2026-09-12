import type { Role } from "../context/AppContext";

export function staffHome(role: Role | null): string {
  if (role === "support") return "/admin-support-inbox";
  if (role === "kyc_officer") return "/admin-customer-kyc";
  if (role === "finance") return "/admin-reconciliation";
  if (role === "collections") return "/admin-overdue-loans";
  if (["loan_officer", "officer", "credit_manager", "manager", "final_approver"].includes(role || "")) return "/admin-officer-dashboard";
  return "/admin-dashboard";
}

export function staffCanOpenScreen(screenId: string, role: Role | null): boolean {
  if (!role) return false;
  if (screenId === "admin-staff") return role === "super_admin";
  const exact: Partial<Record<Role, Set<string>>> = {
    support: new Set(["admin-support-inbox", "admin-customer-list"]),
    kyc_officer: new Set(["admin-customer-kyc", "admin-customer-list"]),
    finance: new Set(["admin-reconciliation", "admin-reports", "admin-customer-list"]),
    collections: new Set(["admin-overdue-loans", "admin-loan-history", "admin-customer-list", "admin-support-inbox"]),
    loan_officer: new Set(["admin-officer-dashboard", "admin-loan-apps", "admin-customer-list", "admin-support-inbox", "admin-approval-history", "admin-officer-contact"]),
    credit_manager: new Set(["admin-officer-dashboard", "admin-loan-apps", "admin-active-loans", "admin-overdue-loans", "admin-loan-history", "admin-customer-list", "admin-customer-kyc", "admin-reports", "admin-support-inbox", "admin-approval-workflow", "admin-approval-history", "admin-officer-contact"]),
    final_approver: new Set(["admin-officer-dashboard", "admin-loan-apps", "admin-active-loans", "admin-overdue-loans", "admin-loan-history", "admin-customer-list", "admin-reports", "admin-approval-history", "admin-officer-contact"]),
  };
  if (exact[role]) return exact[role]!.has(screenId);
  if (["super_admin", "administrator", "admin"].includes(role)) return true;
  if (role === "officer") return exact.loan_officer!.has(screenId);
  if (role === "manager") return screenId !== "admin-staff";
  return false;
}
