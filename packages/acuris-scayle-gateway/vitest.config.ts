import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "**/*.d.ts"],
      thresholds: {
        // adapters.ts + processAddressCheck.ts have many defensive branches
        // (response-envelope variants, custom-extractor paths, suggest
        // fallbacks) that inflate branch count; tuned to 65.
        lines: 75,
        statements: 75,
        functions: 80,
        branches: 65,
      },
      reporter: ["text", "html"],
    },
  },
});
