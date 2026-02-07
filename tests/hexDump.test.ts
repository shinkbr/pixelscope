import assert from "node:assert/strict";
import test from "node:test";
import { buildHexDump } from "../src/utils/hexDump.ts";

test("buildHexDump formats offset, hex, and ASCII", () => {
  const bytes = new Uint8Array([0x41, 0x20, 0x7e, 0x00, 0xff]);
  const dump = buildHexDump(bytes, bytes.length, bytes.length * 8);

  assert.equal(dump.shownBytes, 5);
  assert.equal(dump.totalBytes, 5);
  assert.equal(dump.totalBits, 40);
  assert.equal(dump.isTruncated, false);
  assert.equal(
    dump.text,
    "00000000  41 20 7e 00 ff                                   |A ~..|",
  );
});

test("buildHexDump marks truncated output when shown bytes < total bytes", () => {
  const shown = new Uint8Array([0xaa, 0xbb, 0xcc]);
  const dump = buildHexDump(shown, 10, 80);

  assert.equal(dump.shownBytes, 3);
  assert.equal(dump.totalBytes, 10);
  assert.equal(dump.totalBits, 80);
  assert.equal(dump.isTruncated, true);
});

test("buildHexDump handles empty byte input", () => {
  const dump = buildHexDump(new Uint8Array(0), 0, 0);

  assert.equal(dump.text, "");
  assert.equal(dump.shownBytes, 0);
  assert.equal(dump.totalBytes, 0);
  assert.equal(dump.totalBits, 0);
  assert.equal(dump.isTruncated, false);
});
