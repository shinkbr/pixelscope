import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("index.html metadata", () => {
  it("declares an SVG favicon asset", () => {
    const indexHtml = readFileSync(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );

    const faviconSvg = readFileSync(
      new URL("../public/favicon.svg", import.meta.url),
      "utf8",
    );
    expect(faviconSvg).toContain("<svg");
    expect(faviconSvg).toContain('viewBox="0 0 64 64"');
  });
});
