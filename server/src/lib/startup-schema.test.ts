import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../scripts/start-production.mjs", import.meta.url), "utf8");

test("production startup validates and migrates before serving", () => {
  const validate = script.indexOf('stage: "validate"');
  const migrate = script.indexOf('stage: "migrate"');
  const serve = script.indexOf('stage: "serve"');
  assert.ok(validate >= 0 && migrate > validate && serve > migrate);
});

test("production startup surfaces a structured fatal error", () => {
  assert.match(script, /production\.startup_failed/);
  assert.match(script, /process\.exit\(1\)/);
});
