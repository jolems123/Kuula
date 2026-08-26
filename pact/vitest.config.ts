import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["consumer/**/*.contract.test.ts"],
    passWithNoTests: false,
  },
});
