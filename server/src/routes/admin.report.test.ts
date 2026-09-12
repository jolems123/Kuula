import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-only-secret-that-is-long-enough-for-route-tests-123456789";

test("report range accepts all time and inclusive custom dates", async () => {
  const { reportRange } = await import("./admin.js");
  const all = reportRange({ query: {} } as never);
  assert.equal(all.label, "All time");
  const custom = reportRange({ query: { start: "2026-09-01", end: "2026-09-30" } } as never);
  assert.equal(custom.start?.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(custom.end?.toISOString(), "2026-09-30T23:59:59.999Z");
});

test("report range rejects reversed and invalid dates", async () => {
  const { reportRange } = await import("./admin.js");
  assert.throws(() => reportRange({ query: { start: "2026-10-01", end: "2026-09-01" } } as never), /start date/i);
  assert.throws(() => reportRange({ query: { start: "not-a-date" } } as never), /invalid report date/i);
});
