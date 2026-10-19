import test from "node:test";
import assert from "node:assert/strict";
import { parseVisitCoordinates } from "./location.js";
test("visit coordinates preserve equator, negative longitude and optional absence", () => {
  assert.deepEqual(parseVisitCoordinates(0, "32.5825"), { gpsLatitude: 0, gpsLongitude: 32.5825 });
  assert.deepEqual(parseVisitCoordinates(-1, -30), { gpsLatitude: -1, gpsLongitude: -30 });
  assert.deepEqual(parseVisitCoordinates("", null), { gpsLatitude: null, gpsLongitude: null });
});
test("visit coordinates reject incomplete pairs, out-of-range numbers and coercion", () => {
  for (const pair of [[0, null], [91, 30], [0, 181], [NaN, 0], [true, false], [[], {}]]) {
    assert.throws(() => parseVisitCoordinates(...pair as [unknown, unknown]));
  }
});
