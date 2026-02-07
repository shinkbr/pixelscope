import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("index.html metadata", () => {
  it("declares favicon and PWA metadata assets", () => {
    const indexHtml = readFileSync(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );
    expect(indexHtml).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(indexHtml).toContain(
      '<meta name="theme-color" content="#0b7f63" />',
    );

    const faviconSvg = readFileSync(
      new URL("../public/favicon.svg", import.meta.url),
      "utf8",
    );
    expect(faviconSvg).toContain("<svg");
    expect(faviconSvg).toContain('viewBox="0 0 64 64"');

    const webManifest = JSON.parse(
      readFileSync(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    ) as {
      name: string;
      short_name: string;
      display: string;
      icons: Array<{ src: string }>;
    };
    expect(webManifest.name).toBe("PixelScope Steganography Toolkit");
    expect(webManifest.short_name).toBe("PixelScope");
    expect(webManifest.display).toBe("standalone");
    expect(webManifest.icons.some((icon) => icon.src === "./favicon.svg")).toBe(
      true,
    );
  });
});
