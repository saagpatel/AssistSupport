import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    reporters: ["default"],
    setupFiles: ["./src/test/vitestSetup.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/frontend",
      reporter: ["text-summary", "lcov"],
    },
  },
});
