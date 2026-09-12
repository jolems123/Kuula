import { describe, expect, it } from "vitest";
import { staffCanOpenScreen, staffHome } from "./lib/staff-routing";

describe("staff dashboard routing", () => {
  it("lands dedicated roles on data they may read", () => {
    expect(staffHome("support")).toBe("/admin-support-inbox");
    expect(staffHome("kyc_officer")).toBe("/admin-customer-kyc");
    expect(staffHome("finance")).toBe("/admin-reconciliation");
    expect(staffHome("collections")).toBe("/admin-overdue-loans");
    expect(staffHome("loan_officer")).toBe("/admin-officer-dashboard");
  });

  it("blocks cross-role direct URLs", () => {
    expect(staffCanOpenScreen("admin-reconciliation", "finance")).toBe(true);
    expect(staffCanOpenScreen("admin-loan-apps", "finance")).toBe(false);
    expect(staffCanOpenScreen("admin-customer-kyc", "support")).toBe(false);
    expect(staffCanOpenScreen("admin-reports", "collections")).toBe(false);
    expect(staffCanOpenScreen("admin-overdue-loans", "collections")).toBe(true);
    expect(staffCanOpenScreen("admin-overdue-loans", "final_approver")).toBe(false);
    expect(staffCanOpenScreen("admin-staff", "administrator")).toBe(false);
    expect(staffCanOpenScreen("admin-staff", "super_admin")).toBe(true);
  });
});
