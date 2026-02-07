import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trailing data layout", () => {
  it("uses compact summary text lines for key fields", () => {
    const appSource = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );

    const fileSizeIndex = appSource.indexOf("File Size:");
    const eofOffsetIndex = appSource.indexOf("EOF Offset:");
    const trailingBytesIndex = appSource.indexOf("Trailing Bytes:");
    const rangeIndex = appSource.indexOf("Range:");
    const skippedNullPrefixIndex = appSource.indexOf("Skipped Null Prefix:");

    expect(fileSizeIndex).toBeGreaterThan(-1);
    expect(eofOffsetIndex).toBeGreaterThan(-1);
    expect(trailingBytesIndex).toBeGreaterThan(-1);
    expect(rangeIndex).toBeGreaterThan(-1);
    expect(skippedNullPrefixIndex).toBeGreaterThan(-1);
    expect(fileSizeIndex).toBeLessThan(eofOffsetIndex);
    expect(eofOffsetIndex).toBeLessThan(trailingBytesIndex);
    expect(trailingBytesIndex).toBeLessThan(rangeIndex);
    expect(rangeIndex).toBeLessThan(skippedNullPrefixIndex);
    expect(appSource).toContain(
      '<div className="rounded-xl border border-clay bg-white px-4 py-3 text-sm text-ink/80">',
    );
    expect(appSource).toContain("formatCommaGroupedInteger");
    expect(appSource).toContain("formatByteCountWithHuman");
    expect(appSource).toContain("inline-block w-44 font-medium text-ink");
    expect(appSource).toContain("leading-6");
    expect(appSource).toMatch(
      /File Size:[\s\S]*?<span className="font-mono text-ink">/,
    );
    expect(appSource).toMatch(
      /EOF Offset:[\s\S]*?<span className="font-mono text-ink">/,
    );
    expect(appSource).toMatch(
      /Trailing Bytes:[\s\S]*?<span className="font-mono text-ink">/,
    );
    expect(appSource).toMatch(
      /Range:[\s\S]*?<span className="font-mono text-ink">/,
    );
    expect(appSource).toMatch(
      /Skipped Null Prefix:[\s\S]*?<span className="font-mono text-ink">/,
    );
    expect(appSource).not.toContain(
      '<dl className="grid gap-2 sm:grid-cols-2">',
    );
    expect(appSource).not.toContain("rounded-lg border border-clay/70");
  });
});
