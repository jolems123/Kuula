import test from "node:test";
import assert from "node:assert/strict";
import { parseBusinessProfile } from "./business-profile.js";
const good = {
  businessName: "Kampala Grocers", sector: "Retail", tradingAs: "informal",
  tradingMonths: 24, district: "Wakiso", physicalAddress: "Kitemu trading centre",
  goodsOrServices: "Food and household essentials", customerType: "Walk-in customers",
  staffCount: 2, monthlySales: 2_000_000, monthlyBusinessExpenses: 1_200_000,
  monthlyExistingDebt: 100_000, loanUse: "Buy fast moving inventory",
  repaymentPlan: "Repay from daily stock turnover",
};
test("optional expenditure details reconcile each category and preserve old profiles", () => {
  assert.equal(parseBusinessProfile(good).expenditureItems, undefined);
  const useOfFunds = { stock: 100000, equipment: 0, operations: 50000, expansion: 0, other: 0 };
  const expenditureItems = [{ category: "stock", description: "Rice", amount: 100000 }, { category: "operations", description: "Rent", amount: 50000 }];
  assert.equal(parseBusinessProfile({ ...good, useOfFunds, expenditureItems }).expenditureItems?.length, 2);
  for (const invalid of [
    [{ category: "stock", description: "Rice", amount: 150000 }],
    [{ category: "stock", description: "", amount: 100000 }],
    [{ category: "__proto__", description: "Rice", amount: 100000 }],
    [{ category: "stock", description: "Rice", amount: "100000" }],
    [{ category: "stock", description: "Rice", amount: -1 }],
    Array(31).fill(expenditureItems[0]), {},
  ]) assert.throws(() => parseBusinessProfile({ ...good, useOfFunds, expenditureItems: invalid }), /expenditure/i);
});
test("accepts a small business snapshot", () => {
  const p = parseBusinessProfile(good);
  assert.equal(p.businessName, good.businessName);
  assert.equal(p.registrationNumber, "");
});
test("requires registration number for registered businesses", () => {
  assert.throws(() => parseBusinessProfile({ ...good, tradingAs: "registered" }), /registration number/i);
});
test("rejects empty or insolvent business declarations", () => {
  assert.throws(() => parseBusinessProfile({}), /business name/i);
  assert.throws(() => parseBusinessProfile({ ...good, monthlySales: 1_000_000 }), /expenses and existing debt/i);
});
test("rejects untrusted numeric coercions", () => {
  assert.throws(() => parseBusinessProfile({ ...good, monthlySales: "2000000" }), /monthly business sales/i);
  assert.throws(() => parseBusinessProfile({ ...good, monthlySales: Number.NaN }), /monthly business sales/i);
});
test("accepts valid business GPS coordinates and rejects invalid or incomplete pins", () => {
  const p = parseBusinessProfile({ ...good, latitude: 0.3476, longitude: 32.5825 });
  assert.equal(p.latitude, 0.3476);
  assert.equal(p.longitude, 32.5825);
  assert.throws(() => parseBusinessProfile({ ...good, latitude: 91, longitude: 32 }), /latitude/i);
  assert.throws(() => parseBusinessProfile({ ...good, latitude: 0 }), /both business location coordinates/i);
});

test("records applicant position and provenance for a business map pin", () => {
  const p = parseBusinessProfile({ ...good, applicantPosition: "Owner", latitude: 0.3476, longitude: 32.5825,
    locationSource: "gps", locationCapturedAt: "2026-10-14T10:00:00.000Z", locationAccuracyMeters: 19 });
  assert.equal(p.applicantPosition, "Owner");
  assert.equal(p.locationSource, "gps");
  assert.equal(p.locationAccuracyMeters, 19);
});
test("rejects invalid location provenance and coordinates", () => {
  assert.throws(() => parseBusinessProfile({ ...good, locationSource: "gps" }), /pinned business coordinates/i);
  assert.throws(() => parseBusinessProfile({ ...good, locationSource: "fake" }), /location source/i);
  assert.throws(() => parseBusinessProfile({ ...good, latitude: 0.3476, longitude: 32.5825, locationSource: "gps", locationAccuracyMeters: -2 }), /accuracy/i);
});

test("accepts audited small business operating declarations", () => {
  const p = parseBusinessProfile({ ...good, primarySuppliers: "Kampala wholesalers", supplierPaymentTerms: "Cash",
    salesFrequency: "daily", seasonalPattern: "School holidays are slower", lowSeasonMonthlySales: 900_000,
    inventoryCost: 700_000, rentCost: 150_000, wagesCost: 200_000, otherOperatingCosts: 100_000,
    otherDebtDetails: "Supplier credit paid weekly" });
  assert.equal(p.salesFrequency, "daily");
  assert.equal(p.inventoryCost + p.rentCost + p.wagesCost + p.otherOperatingCosts, 1_150_000);
  assert.equal(p.monthlyBusinessExpenses, good.monthlyBusinessExpenses);
});
test("rejects expense breakdowns that exceed declared total, unreasonable low-season sales and bogus frequencies", () => {
  assert.throws(() => parseBusinessProfile({ ...good, inventoryCost: 1_300_000 }), /breakdown exceeds/i);
  assert.throws(() => parseBusinessProfile({ ...good, lowSeasonMonthlySales: 2_500_000 }), /low-season monthly sales/i);
  assert.throws(() => parseBusinessProfile({ ...good, salesFrequency: "hourly" }), /sales frequency/i);
});

test("parses itemized use of funds and requested repayment frequency", () => {
  const result = parseBusinessProfile({ ...good,
    preferredRepaymentFrequency: "weekly",
    useOfFunds: { stock: 100000, equipment: 0, operations: 50000, expansion: 0, other: 0 },
  });
  assert.equal(result.preferredRepaymentFrequency, "weekly");
  assert.equal(result.useOfFunds.stock + result.useOfFunds.operations, 150000);
});
test("rejects invalid instalment preferences and invented loan-use values", () => {
  assert.throws(() => parseBusinessProfile({ ...good, preferredRepaymentFrequency: "hourly" }), /repayment frequency/i);
  assert.throws(() => parseBusinessProfile({ ...good, useOfFunds: { stock: -10 } }), /funds for stock/i);
  assert.throws(() => parseBusinessProfile({ ...good, useOfFunds: { stock: "ten" } }), /funds for stock/i);
});
