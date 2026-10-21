import { expect, it } from "vitest";
import { safeReturnPath } from "./return-navigation";
it("returns to the actual originating screen and uses a safe direct-link fallback", () => {
  expect(safeReturnPath("/settings", "/language", "welcome")).toBe("/settings");
  expect(safeReturnPath("/profile", "/personal-info", "settings")).toBe("/profile");
  for (const invalid of [undefined, "/language", "https://example.com", "//example.com", "javascript:alert(1)"]) expect(safeReturnPath(invalid, "/language", "settings")).toBe("/settings");
});
