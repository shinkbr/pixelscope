import assert from "node:assert/strict";
import test from "node:test";
import { extractTrailingData } from "../src/utils/trailingData.ts";

function buildPngBytes(trailing: number[] = []): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth/color/interlace
    0x00, 0x00, 0x00, 0x00, // IHDR crc (not validated by parser)
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4e, 0x44, // IEND
    0xae, 0x42, 0x60, 0x82, // IEND crc
    ...trailing,
  ]);
}

function buildJpegBytes(trailing: number[] = []): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x11, 0x22, // APP0 segment with 2-byte payload
    0xff, 0xd9, // EOI
    ...trailing,
  ]);
}

test("extractTrailingData returns null when PNG has no bytes after IEND", () => {
  const source = buildPngBytes();
  const trailing = extractTrailingData(source, "image/png");

  assert.equal(trailing, null);
});

test("extractTrailingData finds bytes after PNG IEND", () => {
  const source = buildPngBytes([0xde, 0xad, 0xbe, 0xef]);
  const trailing = extractTrailingData(source, "image/png");

  assert.ok(trailing);
  assert.equal(trailing.containerEndOffset, source.length - 4);
  assert.equal(trailing.byteLength, 4);
  assert.deepEqual(Array.from(trailing.bytes), [0xde, 0xad, 0xbe, 0xef]);
});

test("extractTrailingData finds bytes after JPEG EOI", () => {
  const source = buildJpegBytes([0x90, 0x91, 0x92]);
  const trailing = extractTrailingData(source, "image/jpeg");

  assert.ok(trailing);
  assert.equal(trailing.containerEndOffset, source.length - 3);
  assert.equal(trailing.byteLength, 3);
  assert.deepEqual(Array.from(trailing.bytes), [0x90, 0x91, 0x92]);
});

test("extractTrailingData returns null for malformed source", () => {
  const source = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

  assert.equal(extractTrailingData(source, "image/png"), null);
  assert.equal(extractTrailingData(source, "image/jpeg"), null);
});
