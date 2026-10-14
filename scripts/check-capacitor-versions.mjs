// Fail closed before packaging a native release when Capacitor CLI/platform versions drift.
// The npm lockfile, not just package.json ranges, determines the installed toolchain.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const names = ["@capacitor/cli", "@capacitor/core", "@capacitor/android", "@capacitor/ios"];
const records = names.map(name => {
  const requested = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  const declaredLocked = lock.packages?.[""]?.dependencies?.[name] ?? lock.packages?.[""]?.devDependencies?.[name];
  const actual = lock.packages?.["node_modules/" + name]?.version;
  assert.ok(requested && declaredLocked && actual, name + " must be declared and locked");
  assert.equal(requested, declaredLocked, name + " package.json differs from lockfile");
  const major = Number(/^\D*(\d+)/.exec(actual)?.[1]);
  assert.ok(Number.isSafeInteger(major), name + " version is invalid");
  return { name, installed: actual, major };
});
const majors = new Set(records.map(x => x.major));
if (majors.size !== 1) {
  console.error("FAIL: Capacitor CLI, Core, Android and iOS must share one major version.");
  for (const { name, installed } of records) console.error(name + ": " + installed);
  console.error("Update the CLI declaration and regenerate package-lock.json together with npm install --package-lock-only, then run npm ci and native builds.");
  process.exit(1);
}
console.log("PASS: Capacitor CLI/Core/Android/iOS all use major version " + records[0].major);
