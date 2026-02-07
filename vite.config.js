var _a, _b, _c;
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
var repoName = (_c = (_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.GITHUB_REPOSITORY) === null || _c === void 0 ? void 0 : _c.split("/")[1];
var base = repoName ? "/".concat(repoName, "/") : "/";
export default defineConfig({
    base: base,
    plugins: [react()],
});
