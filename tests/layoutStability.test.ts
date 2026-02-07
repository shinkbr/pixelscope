import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("layout stability", () => {
  it("reserves scrollbar space to avoid horizontal layout shifts", () => {
    const cssSource = readFileSync(
      new URL("../src/index.css", import.meta.url),
      "utf8",
    );

    expect(cssSource).toContain("html {");
    expect(cssSource).toContain("scrollbar-gutter: stable;");
    expect(cssSource).toContain("overflow-y: scroll;");
  });
});
