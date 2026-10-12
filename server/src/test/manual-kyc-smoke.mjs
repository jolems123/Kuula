/**
 * Isolated API smoke test: registration -> OTP -> 3 KYC photos -> staff
 * decision -> retry -> verified, including negative access checks.
 * Only runs against the dedicated CI PostgreSQL database.
 */
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

if (process.env.NODE_ENV !== "test" || !process.env.ADMIN_TOKEN || !process.env.TEST_OTP_CODE) {
  throw new Error("Manual KYC smoke tests require NODE_ENV=test and CI tokens");
}
const base = "http://localhost:3000";
async function request(path, { method = "GET", token, body } = {}) {
  const result = await fetch(base + path, {
    method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, body: await result.json() };
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([len, name, payload, crc]);
}
function pixelPng(red, green, blue) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1,0); ihdr.writeUInt32BE(1,4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit true-colour
  const idat = deflateSync(Buffer.from([0,red,green,blue]));
  return "data:image/png;base64," + Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const phone = "+256700000099", nationalId = "CM990000000002";
const created = await request("/api/auth/signup", { method: "POST", body: {
  name: "Kuula KYC CI Customer", phone, nationalId, pin: "7392", acceptedTerms: true, termsVersion: "2026-08-20",
} });
assert.equal(created.status, 201, JSON.stringify(created.body));
const verified = await request("/api/auth/verify-phone", { method: "POST", body: { phone, code: process.env.TEST_OTP_CODE } });
assert.equal(verified.status, 200, JSON.stringify(verified.body));
const customerToken = verified.body.token;
assert.ok(customerToken);

const images = {
  nationalId, fullName: "Kuula KYC CI Customer", dob: "1990-01-01",
  frontImage: pixelPng(255,0,0), backImage: pixelPng(0,255,0), portraitImage: pixelPng(0,0,255),
  photoConsent: true,
};
const unauthorized = await request("/api/admin/kyc/queue?status=pending", { token: customerToken });
assert.equal(unauthorized.status, 403);
const noConsent = await request("/api/kyc/submit-documents", { token: customerToken, method: "POST", body: { ...images, photoConsent: false } });
assert.equal(noConsent.status, 400);
const duplicate = await request("/api/kyc/submit-documents", { token: customerToken, method: "POST",
  body: { ...images, backImage: images.frontImage } });
assert.equal(duplicate.status, 400);
const submitted = await request("/api/kyc/submit-documents", { token: customerToken, method: "POST", body: images });
assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
assert.equal(submitted.body.kyc.status, "pending");
const firstId = submitted.body.kyc.submissionId;
const repeated = await request("/api/kyc/submit-documents", { token: customerToken, method: "POST", body: images });
assert.equal(repeated.status, 409);
const customerPreview = await request("/api/admin/kyc/" + firstId + "/preview/front", { token: customerToken });
assert.equal(customerPreview.status, 403);
const queue = await request("/api/admin/kyc/queue?status=pending", { token: process.env.ADMIN_TOKEN });
assert.equal(queue.status, 200);
const record = queue.body.submissions.find(row => row.id === firstId);
assert.ok(record?.hasFront && record?.hasBack && record?.hasPortrait);
for (const side of ["front","back","portrait"]) {
  const preview = await request("/api/admin/kyc/" + firstId + "/preview/" + side, { token: process.env.ADMIN_TOKEN });
  assert.equal(preview.status, 200, side + ": " + JSON.stringify(preview.body));
  assert.ok(preview.body.dataUrl.startsWith("data:image/png;base64,"), side);
}
const rejection = await request("/api/admin/kyc/" + firstId + "/decision", { token: process.env.ADMIN_TOKEN, method: "POST",
  body: { decision: "rejected", reason: "CI intentionally rejects first submission to verify resubmission flow" } });
assert.equal(rejection.status, 200, JSON.stringify(rejection.body));
const retry = await request("/api/kyc/submit-documents", { token: customerToken, method: "POST", body: images });
assert.equal(retry.status, 201, JSON.stringify(retry.body));
assert.equal(retry.body.kyc.version, 2);
const approval = await request("/api/admin/kyc/" + retry.body.kyc.submissionId + "/decision",
  { token: process.env.ADMIN_TOKEN, method: "POST", body: { decision: "verified",
  reason: "CI independently reviewed front, back and portrait test images and ID fields" } });
assert.equal(approval.status, 200, JSON.stringify(approval.body));
const after = await request("/api/kyc/status", { token: customerToken });
assert.equal(after.status, 200);
assert.equal(after.body.kyc.status, "verified");
assert.equal(after.body.kyc.verified, true);
console.log("PASS manual KYC: signup, OTP, three images, RBAC, consent, duplicate checks, rejection, retry, approval.");
