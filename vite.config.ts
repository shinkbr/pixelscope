import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

type MaybeProcess = { process?: { env?: Record<string, string | undefined> } };

const repoName = (
  globalThis as MaybeProcess
).process?.env?.GITHUB_REPOSITORY?.split("/")[1];
const base = repoName ? `/${repoName}/` : "/";

export default defineConfig({
  base,
  plugins: [react()],
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
