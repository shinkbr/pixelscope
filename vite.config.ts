import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

type MaybeProcess = { process?: { env?: Record<string, string | undefined> } };

const repoName = (
  globalThis as MaybeProcess
).process?.env?.GITHUB_REPOSITORY?.split("/")[1];
const base = repoName ? `/${repoName}/` : "/";

export default defineConfig({
  base,
  plugins: [react()],
});
