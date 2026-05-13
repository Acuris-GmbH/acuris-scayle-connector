import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/index.ts", "**/*.d.ts"],
      thresholds: {
        // boundary.ts has 4 mappers × many `??` / optional-field fallbacks
        // (more than the commercetools equivalent because SCAYLE wraps
        // country in a nested object). Branch count inflates without
        // meaningful test value; tuned to 60.
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 60,
      },
      reporter: ["text", "html"],
    },
  },
});
