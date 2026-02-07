import { expect, test } from "vitest";
import { buildHexDump } from "../src/utils/hexDump.ts";

test("buildHexDump formats offset, hex, and ASCII", () => {
  const bytes = new Uint8Array([0x41, 0x20, 0x7e, 0x00, 0xff]);
  const dump = buildHexDump(bytes, bytes.length, bytes.length * 8);

  expect(dump.shownBytes).toBe(5);
  expect(dump.totalBytes).toBe(5);
  expect(dump.totalBits).toBe(40);
  expect(dump.isTruncated).toBe(false);
  expect(
    dump.text,
  ).toBe("00000000  41 20 7e 00 ff                                   |A ~..|");
});

test("buildHexDump reports truncation for empty shown bytes when totalBytes is non-zero", () => {
  const dump = buildHexDump(new Uint8Array(0), 2, 16);

  expect(dump.text).toBe("");
  expect(dump.shownBytes).toBe(0);
  expect(dump.totalBytes).toBe(2);
  expect(dump.totalBits).toBe(16);
  expect(dump.isTruncated).toBe(true);
});

test("buildHexDump marks truncated output when shown bytes < total bytes", () => {
  const shown = new Uint8Array([0xaa, 0xbb, 0xcc]);
  const dump = buildHexDump(shown, 10, 80);

  expect(dump.shownBytes).toBe(3);
  expect(dump.totalBytes).toBe(10);
  expect(dump.totalBits).toBe(80);
  expect(dump.isTruncated).toBe(true);
});

test("buildHexDump handles empty byte input", () => {
  const dump = buildHexDump(new Uint8Array(0), 0, 0);

  expect(dump.text).toBe("");
  expect(dump.shownBytes).toBe(0);
  expect(dump.totalBytes).toBe(0);
  expect(dump.totalBits).toBe(0);
  expect(dump.isTruncated).toBe(false);
});

test("buildHexDump renders multiple lines with incremental offsets", () => {
  const bytes = Uint8Array.from({ length: 17 }, (_, index) => index);
  const dump = buildHexDump(bytes, bytes.length, bytes.length * 8);

  expect(dump.text.split("\n")).toHaveLength(2);
  expect(dump.text.split("\n")[0]?.startsWith("00000000")).toBe(true);
  expect(dump.text.split("\n")[1]?.startsWith("00000010")).toBe(true);
});
