import test from "node:test";
import assert from "node:assert/strict";
import { parseDataUrl } from "./storage.js";

const jpg = Buffer.from([0xff, 0xd8, 0xff, ...Array(40).fill(0)]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(32).fill(0)]);
test("KYC photo type is confirmed against magic bytes", () => {
  assert.equal(parseDataUrl("data:image/jpeg;base64," + jpg.toString("base64")).mime, "image/jpeg");
  assert.equal(parseDataUrl("data:image/png;base64," + png.toString("base64")).mime, "image/png");
  assert.throws(() => parseDataUrl("data:image/png;base64," + jpg.toString("base64")), /does not match/);
});
test("KYC photo validation rejects invalid and oversized files", () => {
  assert.throws(() => parseDataUrl("data:image/jpeg;base64," + Buffer.from("fake").toString("base64")));
  assert.throws(() => parseDataUrl("data:image/jpeg;base64," + Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")), /too large/);
});
