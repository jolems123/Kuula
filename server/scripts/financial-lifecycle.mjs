// End-to-end money lifecycle against a running API (NODE_ENV=test) and the fake MarzPay
// in src/test/fake-marzpay-server.ts. Used by CI and runnable locally:
//   node scripts/financial-lifecycle.mjs
// Expects the seeded CI customer/admin and an empty disbursement history for them.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { deflateSync } from "node:zlib";

// Generate distinct, structurally valid 1x1 PNGs for private evidence tests.
function testPng(red, green, blue) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const chunk = (name, data) => {
    const type = Buffer.from(name, "ascii");
    const crcData = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of crcData) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const header = Buffer.alloc(4), end = Buffer.alloc(4);
    header.writeUInt32BE(data.length); end.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, crcData, end]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const image = Buffer.concat([signature, chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, red, green, blue]))),
    chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + image.toString("base64");
}
const API = process.env.LIFECYCLE_API_URL || "http://localhost:3000";
const FAKE = (process.env.MARZPAY_BASE_URL || "http://127.0.0.1:3999/api/v1").replace(/\/api\/v1\/?$/, "");
const WEBHOOK_TOKEN = process.env.MARZPAY_WEBHOOK_SECRET || "ci-webhook-secret";
const prisma = new PrismaClient();

async function call(method, path, { token, body, base = API, expect } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (expect !== undefined) {
    assert.equal(response.status, expect, `${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  } else if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}
const webhook = (payload, expect) => call("POST", `/api/payments/marzpay/webhook?token=${WEBHOOK_TOKEN}`, { body: payload, expect });
const fakeSettle = (reference, status) => call("POST", "/__test/settle", { base: FAKE, body: { reference, status } });
const step = (name) => console.log(`- ${name}`);

const business = {
  businessName: "CI Grocery Trading", sector: "Retail / shop", tradingAs: "informal", registrationNumber: "", tradingMonths: 28,
  district: "Wakiso", physicalAddress: "CI Grocery Street", goodsOrServices: "Retail groceries and household items",
  customerType: "Walk-in customers", staffCount: 2, monthlySales: 1000000, monthlyBusinessExpenses: 250000, monthlyExistingDebt: 0,
  loanUse: "Restock retail inventory", repaymentPlan: "Daily sales cash flow",
};
const applicationBody = {
  amount: 100000, purpose: "Business: Working capital", termDays: 90, channel: "MTN MoMo", employmentStatus: "Business owner",
  occupationOrBusiness: "Grocery shop", employerOrBusinessName: "CI Grocery Trading", workDuration: "2+ years",
  incomeSource: "Business sales", repaymentSource: "Daily sales", declaredMonthlyIncome: 1000000, declaredMonthlyExpenses: 250000,
  existingDebtPayment: 0, business,
};

try {
  step("sign in customer and admin");
  const customer = await call("POST", "/api/auth/login", { body: { phone: process.env.DEMO_PHONE || "+256700000000", pin: process.env.DEMO_PIN || "7391" } });
  assert.ok(customer.token && customer.refreshToken);
  const admin = await call("POST", "/api/auth/admin-login", { body: { email: process.env.ADMIN_EMAIL || "admin-ci@kuula.test", password: process.env.ADMIN_PASSWORD || "Admin-CI-Password-Only-2026" } });
  assert.ok(admin.token);
  const C = customer.token;
  const A = admin.token;

  step("apply; duplicate application refused; approval refused until the business is verified");
  const application = await call("POST", "/api/loans/applications", { token: C, body: applicationBody });
  const applicationId = application.application.id;
  assert.ok(applicationId);
  await call("POST", "/api/loans/applications", { token: C, body: applicationBody, expect: 409 });
  await call("POST", "/api/loans/applications/decision", { token: A, body: { id: applicationId, decision: "approved", notes: "Unverified business test must be denied" }, expect: 422 });
  await call("POST", `/api/loans/applications/${applicationId}/business-review`, {
    token: A, body: { status: "verified", notes: "Inspected business turnover and premises photographs" }, expect: 422,
  });
  step("private business photos: ownership, required uploads, distinctness and duplicate protection");
  const photoPath = `/api/loans/applications/${applicationId}/business-photos`;
  const photoData = {
    exterior: testPng(255, 0, 0),
    interior: testPng(0, 255, 0),
    applicant_at_business: testPng(0, 0, 255),
  };
  await call("GET", photoPath, { expect: 401 });
  await call("POST", photoPath, { token: C, body: { photoConsent: false, photos: photoData }, expect: 400 });
  await call("POST", photoPath, { token: C, body: { photoConsent: true, photos: { exterior: photoData.exterior } }, expect: 400 });
  await call("POST", photoPath, { token: C, body: { photoConsent: true, photos: { ...photoData, interior: photoData.exterior } }, expect: 400 });
  await call("POST", photoPath, { token: C, body: { photoConsent: true, photos: photoData }, expect: 201 });
  const photoList = await call("GET", photoPath, { token: C });
  assert.equal(photoList.photos.length, 3);
  assert.ok(["exterior", "interior", "applicant_at_business"].every(kind =>
    photoList.photos.some(photo => photo.type === kind)));
  await call("POST", photoPath, { token: C, body: { photoConsent: true, photos: photoData }, expect: 409 });
  const review = await call("POST", `/api/loans/applications/${applicationId}/business-review`, { token: A, body: { status: "verified", notes: "CI verified trading operations and business turnover evidence" } });
  assert.equal(review.application.businessReviewStatus, "verified");
  step("an approval above the approver's configured authority is refused");
  const approverRole = admin.user?.role || admin.role;
  await call("PUT", `/api/staff/authority-limits/${approverRole}`, { token: A, body: { maxAmount: 50000, reason: "CI authority limit test" } });
  await call("POST", "/api/loans/applications/decision", { token: A, body: { id: applicationId, decision: "approved", notes: "Above authority must be refused" }, expect: 403 });
  await call("PUT", `/api/staff/authority-limits/${approverRole}`, { token: A, body: { maxAmount: null, reason: "CI removes the test limit" } });
  const offer = await call("POST", "/api/loans/applications/decision", { token: A, body: { id: applicationId, decision: "approved", notes: "CI approval after underwriting recheck" } });
  assert.equal(offer.application.status, "offered");

  step("accepting needs the signed agreement and moves no money: the payout waits for release");
  await call("POST", `/api/loans/${applicationId}/accept`, { token: C, expect: 409 });
  const agreement = await call("POST", `/api/loans/${applicationId}/agreement/accept`, { token: C, body: { clientContext: { source: "ci" } } });
  assert.equal(agreement.ok, true);
  const accepted = await call("POST", `/api/loans/${applicationId}/accept`, { token: C });
  assert.equal(accepted.disbursement.status, "awaiting_release");
  assert.ok(accepted.disbursement.legs.every((leg) => !leg.reference), "no payment reference exists before release");
  // The CI database is freshly seeded, so no payout transaction may exist yet.
  assert.equal(await prisma.transaction.count({ where: { type: "loan_disbursement_leg" } }), 0);

  step("release is refused to the borrower and to the admin who approved the loan");
  await call("POST", `/api/loans/${applicationId}/disbursement/release`, { token: C, expect: 403 });
  await call("POST", `/api/loans/${applicationId}/disbursement/release`, { token: A, expect: 403 });

  step("an independent finance officer releases it; MarzPay's charge is recorded");
  const financeEmail = "finance-ci@kuula.test";
  const financePassword = "Finance-CI-Password-Only-2026";
  await prisma.user.upsert({
    where: { email: financeEmail },
    update: { role: "finance", passwordHash: await bcrypt.hash(financePassword, 10), phoneVerified: true, deletedAt: null },
    create: { email: financeEmail, fullName: "CI Finance Officer", role: "finance", phoneVerified: true, passwordHash: await bcrypt.hash(financePassword, 10) },
  });
  const finance = await call("POST", "/api/auth/admin-login", { body: { email: financeEmail, password: financePassword } });
  const waiting = await call("GET", "/api/loans/disbursements/awaiting-release", { token: finance.token });
  assert.ok(waiting.payouts.some((payout) => payout.applicationId === applicationId));
  const released = await call("POST", `/api/loans/${applicationId}/disbursement/release`, { token: finance.token });
  assert.equal(released.ok, true);
  await call("POST", `/api/loans/${applicationId}/disbursement/release`, { token: finance.token, expect: 409 });
  const disbursementRef = released.disbursement.legs[0].reference;
  assert.ok(disbursementRef);
  const liquidity = await call("GET", "/api/admin/liquidity", { token: A });
  assert.equal(liquidity.wallet.availableUgx, Number(process.env.FAKE_MARZPAY_BALANCE || 50_000_000));
  assert.equal(liquidity.committed.inFlight, 100000, "a released payout counts as committed until it settles");
  const payoutTx = await prisma.transaction.findUnique({ where: { reference: disbursementRef } });
  assert.equal(payoutTx.providerFee, BigInt(500), "send-money charge from the create response is stored");
  assert.ok(payoutTx.transactionId, "MarzPay transaction uuid is stored");

  step("a callback with the wrong amount is held; later callbacks stay blocked until reviewed");
  const finalPayout = await fakeSettle(disbursementRef, "completed");
  assert.equal(finalPayout.transaction.provider_reference, disbursementRef);
  assert.notEqual(finalPayout.transaction.reference, disbursementRef, "MarzPay's own reference differs from Kuula's");
  const wrongAmount = structuredClone(finalPayout);
  wrongAmount.transaction.amount.raw = 99999;
  await webhook(wrongAmount, 409);
  await webhook(finalPayout, 409);
  const held = await call("GET", "/api/admin/reconciliation", { token: A });
  assert.ok(held.transactions.some((row) => row.reference === disbursementRef && row.reconciliationStatus === "reconciliation_required"));
  await call("POST", `/api/admin/reconciliation/${payoutTx.id}/review`, { token: A, body: { note: "CI verified provider amount/reference before accepting replay" } });

  step("the documented send-money callback (our reference in provider_reference) settles the loan");
  const settledPayout = await webhook(finalPayout, 200);
  assert.equal(settledPayout.settled, true);
  const status = await call("GET", `/api/loans/${applicationId}/disbursement`, { token: C });
  assert.equal(status.disbursement.status, "settled");
  assert.equal(status.disbursement.totalSettled, 100000);
  const replay = await webhook(finalPayout, 200);
  assert.equal(replay.settled, false, "a repeated callback changes nothing");
  const payoutJournal = await prisma.journal.findUnique({ where: { transactionId: payoutTx.id }, include: { entries: true } });
  assert.deepEqual(
    payoutJournal.entries.map((entry) => `${entry.accountCode}:${entry.direction}:${entry.amount}`).sort(),
    ["LOAN_PRINCIPAL_RECEIVABLE:debit:100000", "MOBILE_MONEY_CLEARING:credit:100500", "PROVIDER_FEE_EXPENSE:debit:500"],
  );
  await assert.rejects(prisma.journalEntry.updateMany({ where: { journalId: payoutJournal.id }, data: { amount: BigInt(1) } }), /append-only/);

  step("partial repayment confirmed by a status lookup, without any callback");
  const payment = await call("POST", "/api/loans/repayment/pay", { token: C, body: { amount: 10000 } });
  assert.ok(payment.reference && payment.uuid);
  await call("POST", "/api/loans/repayment/pay", { token: C, body: { amount: 5000 }, expect: 409 });
  const paymentTx = await prisma.transaction.findUnique({ where: { reference: payment.reference } });
  await fakeSettle(payment.reference, "completed");
  const verified = await call("POST", `/api/admin/reconciliation/${paymentTx.id}/verify`, { token: A });
  assert.equal(verified.lookup, "found");
  assert.equal(verified.settlement.body.settled, true);
  let repayment = await call("GET", "/api/loans/repayment", { token: C });
  assert.equal(repayment.repayment.amount_paid, 10000);

  step("the late callback for that same collection is a harmless duplicate");
  const lateCallback = await fakeSettle(payment.reference, "completed");
  lateCallback.transaction.charge = { raw: 350, currency: "UGX" };
  assert.equal((await webhook(lateCallback, 200)).settled, false);
  repayment = await call("GET", "/api/loans/repayment", { token: C });
  assert.equal(repayment.repayment.amount_paid, 10000);

  step("a failed collection leaves the balance unchanged and frees the customer to pay again");
  const failing = await call("POST", "/api/loans/repayment/pay", { token: C, body: { amount: 5000 } });
  const failedCallback = await fakeSettle(failing.reference, "failed");
  await webhook(failedCallback, 200);
  repayment = await call("GET", "/api/loans/repayment", { token: C });
  assert.equal(repayment.repayment.amount_paid, 10000);

  step("a lost MarzPay response stays open, blocks a second prompt, and settles once confirmed");
  await call("POST", "/__test/lose-next-response", { base: FAKE, body: {} });
  const uncertain = await call("POST", "/api/loans/repayment/pay", { token: C, body: { amount: 20000 }, expect: 202 });
  assert.equal(uncertain.isPending, true);
  const uncertainTx = await prisma.transaction.findUnique({ where: { reference: uncertain.reference } });
  assert.equal(uncertainTx.status, "pending");
  assert.equal(uncertainTx.reconciliationStatus, "awaiting_provider");
  await call("POST", "/api/loans/repayment/pay", { token: C, body: { amount: 20000 }, expect: 409 });
  await fakeSettle(uncertain.reference, "completed");
  const recovered = await call("POST", `/api/admin/reconciliation/${uncertainTx.id}/verify`, { token: A });
  assert.equal(recovered.settlement.body.settled, true);
  repayment = await call("GET", "/api/loans/repayment", { token: C });
  assert.equal(repayment.repayment.amount_paid, 30000);

  step("repayment journals settle interest first, then principal, crediting the borrower in full");
  const loanInterest = Number((await prisma.loanApplication.findUnique({ where: { id: applicationId }, select: { interest: true } })).interest);
  assert.ok(loanInterest > 0 && loanInterest < 10000, "the first 10,000 payment covers all interest");
  const credits = async (transactionId) => Object.fromEntries((await prisma.journalEntry.findMany({ where: { journal: { transactionId }, direction: "credit" } }))
    .map((entry) => [entry.accountCode, Number(entry.amount)]));
  assert.deepEqual(await credits(paymentTx.id), { INTEREST_INCOME: loanInterest, LOAN_PRINCIPAL_RECEIVABLE: 10000 - loanInterest });
  assert.deepEqual(await credits(uncertainTx.id), { LOAN_PRINCIPAL_RECEIVABLE: 20000 });
  const receivable = await prisma.journalEntry.groupBy({ by: ["direction"], where: { accountCode: "LOAN_PRINCIPAL_RECEIVABLE" }, _sum: { amount: true } });
  const byDirection = Object.fromEntries(receivable.map((row) => [row.direction, Number(row._sum.amount)]));
  assert.equal(byDirection.debit - byDirection.credit, 100000 - (30000 - loanInterest), "principal receivable equals principal not yet repaid");
  const trial = await call("GET", "/api/admin/reconciliation/trial-balance", { token: A });
  assert.equal(trial.balanced, true, "total debits equal total credits");
  const account = (code) => trial.accounts.find((row) => row.account === code)?.balance ?? 0;
  assert.equal(account("LOAN_PRINCIPAL_RECEIVABLE"), 100000 - (30000 - loanInterest));
  assert.equal(account("INTEREST_INCOME"), -loanInterest);
  const journalCount = await prisma.journal.count();
  assert.ok(journalCount >= 3);

  step("today's transactions reconcile exactly against MarzPay's own records");
  const today = new Date().toISOString().slice(0, 10);
  const run = await call("POST", "/api/admin/reconciliation/provider-runs", { token: A, body: { day: today } });
  const detail = await call("GET", `/api/admin/reconciliation/provider-runs/${run.id}`, { token: A });
  assert.equal(run.status, "matched", JSON.stringify(detail.run.exceptions));
  assert.equal(run.summary.kuulaCount, run.summary.providerCount);
  assert.equal(run.summary.kuulaCount, 4, "one payout and three collections");

  step("money that matches no open loan is held, then refunded by two different people");
  const orphanReference = crypto.randomUUID();
  const customerUser = await prisma.user.findUnique({ where: { phone: process.env.DEMO_PHONE || "+256700000000" } });
  await prisma.transaction.create({
    data: { userId: customerUser.id, loanId: `orphan-${orphanReference.slice(0, 8)}`, type: "loan_payment", amount: BigInt(5000), status: "pending", reference: orphanReference, provider: "marzpay", providerStatus: "processing", reconciliationStatus: "unreconciled" },
  });
  const orphanCallback = await call("POST", "/__test/record-collection", { base: FAKE, body: { reference: orphanReference, amount: 5000 } });
  assert.equal((await webhook(orphanCallback, 200)).unapplied, true);
  const refundable = await call("GET", "/api/admin/refunds", { token: A });
  const heldMoney = refundable.refundable.find((row) => row.reference === orphanReference);
  assert.equal(heldMoney.refundable, 5000);
  assert.equal(heldMoney.account, "LOAN_COLLECTIONS_SUSPENSE");
  await call("POST", "/api/admin/refunds", { token: A, body: { sourceTransactionId: heldMoney.transactionId, amount: 6000, reason: "Customer paid after the loan was settled" }, expect: 422 });
  const refund = await call("POST", "/api/admin/refunds", { token: A, body: { sourceTransactionId: heldMoney.transactionId, amount: 5000, reason: "Customer paid after the loan was settled" }, expect: 201 });
  await call("POST", "/api/admin/refunds", { token: A, body: { sourceTransactionId: heldMoney.transactionId, amount: 1, reason: "A second request must find nothing left" }, expect: 422 });
  await call("POST", `/api/admin/refunds/${refund.id}/approve`, { token: A, expect: 403 });
  const sent = await call("POST", `/api/admin/refunds/${refund.id}/approve`, { token: finance.token });
  assert.equal(sent.status, "sent");
  await call("POST", `/api/admin/refunds/${refund.id}/approve`, { token: finance.token, expect: 409 });
  const refundCallback = await fakeSettle(sent.reference, "completed");
  assert.equal((await webhook(refundCallback, 200)).settled, true);
  const refundTx = await prisma.transaction.findUnique({ where: { reference: sent.reference }, include: { journal: { include: { entries: true } } } });
  assert.deepEqual(
    refundTx.journal.entries.map((entry) => `${entry.accountCode}:${entry.direction}:${entry.amount}`).sort(),
    ["LOAN_COLLECTIONS_SUSPENSE:debit:5000", "MOBILE_MONEY_CLEARING:credit:5500", "PROVIDER_FEE_EXPENSE:debit:500"],
  );
  const afterRefund = await call("GET", "/api/admin/refunds", { token: A });
  assert.equal(afterRefund.refunds.find((row) => row.id === refund.id).status, "completed");
  const openQueue = await call("GET", "/api/admin/reconciliation", { token: A });
  assert.ok(!openQueue.transactions.some((row) => row.reference === orphanReference), "a fully refunded payment leaves the open queue");
  assert.equal((await call("GET", "/api/admin/reconciliation/trial-balance", { token: A })).balanced, true);

  console.log("Financial lifecycle passed");
} finally {
  await prisma.$disconnect();
}
