// End-to-end check of the production credit path, run against an API started with
// NODE_ENV=test and CREDIT_OPERATIONS_REQUIRED=true (the staged-review gate on) and
// the fake MarzPay. Uses only the roles staff get through invitations.
//   node scripts/staged-credit-lifecycle.mjs
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { testPng } from "./test-business-photo-fixtures.mjs";

const API = process.env.LIFECYCLE_API_URL || "http://localhost:3000";
const FAKE = (process.env.MARZPAY_BASE_URL || "http://127.0.0.1:3999/api/v1").replace(/\/api\/v1\/?$/, "");
const WEBHOOK_TOKEN = process.env.MARZPAY_WEBHOOK_SECRET || "ci-webhook-secret";
const prisma = new PrismaClient();
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const NARRATIVE = "The business trades daily from a fixed stall with visible stock and steady customer flow; cash flow covers the repayment.";

async function call(method, path, { token, body, base = API, expect } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (expect !== undefined) assert.equal(response.status, expect, `${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  else if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  return json;
}
const step = (name) => console.log(`- ${name}`);

async function staff(role, label) {
  const email = `${label}-staged@kuula.test`;
  const password = `${label}-Staged-CI-Password-2026`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role, passwordHash, phoneVerified: true, deletedAt: null },
    create: { email, fullName: `CI ${label}`, role, passwordHash, phoneVerified: true },
  });
  const session = await call("POST", "/api/auth/admin-login", { body: { email, password } });
  return { id: user.id, token: session.token };
}

try {
  step("staff invited with the dedicated roles, and a second business customer");
  const officer = await staff("loan_officer", "officer");
  const manager = await staff("credit_manager", "manager");
  const approver = await staff("final_approver", "approver");
  const finance = await staff("finance", "finance");
  const admin = await call("POST", "/api/auth/admin-login", { body: { email: process.env.ADMIN_EMAIL || "admin-ci@kuula.test", password: process.env.ADMIN_PASSWORD || "Admin-CI-Password-Only-2026" } });

  // A number no other CI script uses (the KYC smoke test uses ...099).
  const phone = "+256700000077";
  const pinHash = await bcrypt.hash("7391", 10);
  const customerUser = await prisma.user.upsert({
    where: { phone },
    update: { pinHash, phoneVerified: true, kycVerified: true, role: "customer", deletedAt: null },
    create: { phone, fullName: "Staged Trader", role: "customer", pinHash, phoneVerified: true, kycVerified: true, termsAcceptedAt: new Date() },
  });
  // This isolated CI borrower must satisfy the same reviewed-document gate as real borrowers.
  // No production bypass: the fixture exists only in NODE_ENV=test.
  if (process.env.NODE_ENV !== "test") throw new Error("KYC test fixture must never run outside NODE_ENV=test");
  const priorKyc = await prisma.kycSubmission.findFirst({where:{userId:customerUser.id},orderBy:{version:"desc"}});
  if (!priorKyc) {
    await prisma.kycSubmission.create({data:{
      userId:customerUser.id,version:1,status:"verified",fullName:customerUser.fullName,
      nationalId:"CM900000000077",dateOfBirth:new Date("1990-01-01T00:00:00.000Z"),
      frontRef:"ci-fixture/front.jpg",backRef:"ci-fixture/back.jpg",portraitRef:"ci-fixture/portrait.jpg",
      frontMime:"image/jpeg",backMime:"image/jpeg",portraitMime:"image/jpeg",
      provider:"isolated-ci-fixture",reviewedAt:new Date(),
      decisionReason:"Isolated staged-credit lifecycle test KYC"
    }});
  }
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  for (const [sourceType, extra] of [["mobile_money", { momoMonths: 12, momoTxnCount: 150 }], ["crb", { crbStatus: "clean" }]]) {
    await prisma.creditEvidence.upsert({
      where: { provider_externalReference: { provider: "ci-staged", externalReference: `${sourceType}-${customerUser.id}` } },
      update: {},
      create: { userId: customerUser.id, sourceType, provider: "ci-staged", externalReference: `${sourceType}-${customerUser.id}`, observedAt: new Date(), expiresAt, verifiedBy: admin.user?.id ?? null, ...extra },
    });
  }
  const customer = await call("POST", "/api/auth/login", { body: { phone, pin: "7391" } });

  step("application; the business is verified; an offer is refused without Level 3 approval");
  const business = { businessName: "Staged Hardware", sector: "Retail / shop", tradingAs: "informal", registrationNumber: "", tradingMonths: 30, district: "Kampala", physicalAddress: "Staged Street", goodsOrServices: "Hardware and building supplies", customerType: "Walk-in customers", staffCount: 3, monthlySales: 1500000, monthlyBusinessExpenses: 400000, monthlyExistingDebt: 0, loanUse: "Restock hardware", repaymentPlan: "Daily sales cash flow" };
  const created = await call("POST", "/api/loans/applications", {
    token: customer.token,
    body: { amount: 200000, purpose: "Business: Working capital", termDays: 60, channel: "MTN MoMo", employmentStatus: "Business owner", occupationOrBusiness: "Hardware shop", employerOrBusinessName: "Staged Hardware", workDuration: "2+ years", incomeSource: "Business sales", repaymentSource: "Daily sales", declaredMonthlyIncome: 1500000, declaredMonthlyExpenses: 400000, existingDebtPayment: 0, business },
  });
  const id = created.application.id;
  const photoPath = `/api/loans/applications/${id}/business-photos`;
  await call("POST", `/api/loans/applications/${id}/business-review`, {
    token: admin.token, body: { status: "verified", notes: "Cannot verify without business photos" }, expect: 422,
  });
  await call("GET", photoPath, { token: finance.token, expect: 404 });
  const photoPayload = {
    exterior: testPng(220, 30, 30),
    interior: testPng(30, 220, 30),
    applicant_at_business: testPng(30, 30, 220),
  };
  await call("POST", photoPath, { token: customer.token, body: { photoConsent: true, photos: photoPayload }, expect: 201 });
  const receipt = await call("GET", photoPath, { token: customer.token });
  assert.equal(receipt.photos.length, 3);
  await call("GET", photoPath, { token: officer.token });
  await call("POST", `/api/loans/applications/${id}/business-review`, { token: admin.token, body: { status: "verified", notes: "Staged CI verified the business premises and turnover records" } });
  await call("POST", "/api/loans/applications/decision", { token: approver.token, body: { id, decision: "approved", notes: "Attempt before the staged review" }, expect: 409 });

  step("Level 1: the invited loan officer is assignable, evaluates and uploads field evidence");
  const level1Staff = await call("GET", "/api/operations/staff?role=officer", { token: admin.token });
  assert.ok(level1Staff.staff.some((member) => member.id === officer.id), "loan_officer appears in the Level 1 picker");
  await call("POST", `/api/operations/applications/${id}/assign`, { token: admin.token, body: { level: 1, assigneeId: officer.id } });
  await call("POST", `/api/operations/applications/${id}/evaluation`, {
    token: officer.token,
    body: { businessName: "Staged Hardware", businessType: "Retail", businessLocation: "Kampala", yearsOperating: 3, employeeCount: 3, estimatedMonthlySales: 1500000, estimatedStockValue: 4000000, monthlyOperatingExpenses: 400000, existingBusinessDebt: 0,
      businessObservations: NARRATIVE, financialObservations: NARRATIVE, characterAssessment: NARRATIVE, repaymentCapacity: NARRATIVE, risks: "Seasonal demand", mitigatingFactors: "Diversified stock", purposeAssessment: "Working capital for stock", recommendation: "approve", recommendedAmount: 200000, recommendedTermDays: 60 },
  });
  for (const evidenceType of ["storefront", "stock"]) {
    await call("POST", `/api/operations/applications/${id}/evidence`, { token: officer.token, body: { evidenceType, dataUrl: PNG }, expect: 201 });
  }
  step("Level 1 pricing: assigned officer sets interest and itemized fees before escalation");
  await call("POST", `/api/operations/applications/${id}/pricing-proposal`, {
    token: customer.token, body: {aprPercent: 9,charges:[]}, expect:403,
  });
  await call("POST", `/api/operations/applications/${id}/pricing-proposal`, {
    token: officer.token, body: {aprPercent: 9,charges:[{label:"Loan processing",amount:100}]}, expect:201,
  });
  await call("POST", `/api/operations/applications/${id}/submit`, { token: officer.token, body: { narrative: NARRATIVE, nextAssigneeId: manager.id } });

  step("Level 2: the credit manager recommends; a Level 1 officer cannot be made the final approver");
  await call("POST", `/api/operations/applications/${id}/submit`, { token: manager.token, body: { narrative: NARRATIVE, nextAssigneeId: officer.id, recommendedAmount: 200000, recommendedTermDays: 60 }, expect: 422 });
  await call("POST", `/api/operations/applications/${id}/submit`, { token: manager.token, body: { narrative: NARRATIVE, nextAssigneeId: approver.id, recommendedAmount: 200000, recommendedTermDays: 60 } });

  step("Level 3: the final approver approves, then creates the offer");
  await call("POST", `/api/operations/applications/${id}/decision`, { token: approver.token, body: { action: "approve", narrative: NARRATIVE } });
  const offer = await call("POST", "/api/loans/applications/decision", { token: approver.token, body: { id, decision: "approved", notes: "Approved through the staged credit review" } });
  assert.equal(offer.application.status, "offered");

  step("the customer accepts; only an uninvolved finance officer can release the payout");
  await call("POST", `/api/loans/${id}/agreement/accept`, { token: customer.token, body: { clientContext: { source: "ci-staged" } } });
  const accepted = await call("POST", `/api/loans/${id}/accept`, { token: customer.token });
  assert.equal(accepted.disbursement.status, "awaiting_release");
  await call("POST", `/api/loans/${id}/disbursement/release`, { token: approver.token, expect: 403 });
  await call("POST", `/api/loans/${id}/disbursement/release`, { token: admin.token, expect: 403 });
  await call("POST", `/api/loans/${id}/disbursement/release`, { token: officer.token, expect: 403 });
  const released = await call("POST", `/api/loans/${id}/disbursement/release`, { token: finance.token });
  assert.equal(released.ok, true);

  step("MarzPay confirms the payout and the loan becomes active");
  const callback = await call("POST", "/__test/settle", { base: FAKE, body: { reference: released.disbursement.legs[0].reference, status: "completed" } });
  const settled = await call("POST", `/api/payments/marzpay/webhook?token=${WEBHOOK_TOKEN}`, { body: callback });
  assert.equal(settled.settled, true);
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  assert.equal(application.status, "active");

  console.log("Staged credit lifecycle passed");
} finally {
  await prisma.$disconnect();
}
