import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app header", () => {
  it("includes a GitHub repository link", () => {
    const appSource = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );

    expect(appSource).toContain("https://github.com/shinkbr/pixelscope");
    expect(appSource).toContain(
      'aria-label="View PixelScope repository on GitHub"',
    );
  });
});
