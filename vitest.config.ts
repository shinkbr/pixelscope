import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/utils/**/*.ts"],
      thresholds: {
        perFile: true,
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
