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
