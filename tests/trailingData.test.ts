import { expect, test } from "vitest";
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

  expect(trailing).toBeNull();
});

test("extractTrailingData finds bytes after PNG IEND", () => {
  const source = buildPngBytes([0xde, 0xad, 0xbe, 0xef]);
  const trailing = extractTrailingData(source, "image/png");

  expect(trailing).not.toBeNull();
  expect(trailing?.containerEndOffset).toBe(source.length - 4);
  expect(trailing?.byteLength).toBe(4);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0xde, 0xad, 0xbe, 0xef]);
});

test("extractTrailingData finds bytes after JPEG EOI", () => {
  const source = buildJpegBytes([0x90, 0x91, 0x92]);
  const trailing = extractTrailingData(source, "image/jpeg");

  expect(trailing).not.toBeNull();
  expect(trailing?.containerEndOffset).toBe(source.length - 3);
  expect(trailing?.byteLength).toBe(3);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0x90, 0x91, 0x92]);
});

test("extractTrailingData returns null for malformed source", () => {
  const source = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

  expect(extractTrailingData(source, "image/png")).toBeNull();
  expect(extractTrailingData(source, "image/jpeg")).toBeNull();
});

test("extractTrailingData returns null for PNG with wrong signature", () => {
  const source = buildPngBytes();
  source[0] = 0x00;
  expect(extractTrailingData(source, "image/png")).toBeNull();
});

test("extractTrailingData returns null for truncated PNG chunk", () => {
  const source = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x20, // too large for provided bytes
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x00,
  ]);
  expect(extractTrailingData(source, "image/png")).toBeNull();
});

test("extractTrailingData handles JPEG with stuffed marker bytes", () => {
  const source = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0x00, // stuffed 0xFF byte in entropy stream
    0xff, 0xd9, // EOI
    0xaa,
  ]);
  const trailing = extractTrailingData(source, "image/jpeg");
  expect(trailing).not.toBeNull();
  expect(trailing?.containerEndOffset).toBe(source.length - 1);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0xaa]);
});

test("extractTrailingData handles JPEG standalone markers before EOI", () => {
  const source = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xd0, // RST0 standalone marker
    0xff, 0xd9, // EOI
    0xbb,
  ]);
  const trailing = extractTrailingData(source, "image/jpeg");
  expect(trailing).not.toBeNull();
  expect(trailing?.byteLength).toBe(1);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0xbb]);
});

test("extractTrailingData returns null for JPEG invalid segment lengths", () => {
  const tooShortLength = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x01, // invalid length < 2
    0xff, 0xd9,
  ]);
  const missingLengthBytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe2, 0x00, // marker but incomplete length
  ]);
  const segmentOverrun = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe3, 0x00, 0x08, 0x01, // segment too short for declared length
  ]);

  expect(extractTrailingData(tooShortLength, "image/jpeg")).toBeNull();
  expect(extractTrailingData(missingLengthBytes, "image/jpeg")).toBeNull();
  expect(extractTrailingData(segmentOverrun, "image/jpeg")).toBeNull();
});

test("extractTrailingData handles JPEG data bytes between markers", () => {
  const source = new Uint8Array([
    0xff, 0xd8, // SOI
    0x11, // non-marker data byte
    0xff, 0xd9, // EOI
    0xcc,
  ]);

  const trailing = extractTrailingData(source, "image/jpeg");
  expect(trailing).not.toBeNull();
  expect(trailing?.byteLength).toBe(1);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0xcc]);
});

test("extractTrailingData handles JPEG repeated 0xFF marker prefix bytes", () => {
  const source = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xff, 0xd9, // repeated 0xFF then EOI
    0xdd,
  ]);

  const trailing = extractTrailingData(source, "image/jpeg");
  expect(trailing).not.toBeNull();
  expect(trailing?.byteLength).toBe(1);
  expect(Array.from(trailing?.bytes ?? [])).toEqual([0xdd]);
});

test("extractTrailingData returns null when JPEG ends on repeated marker prefix bytes", () => {
  const source = new Uint8Array([0xff, 0xd8, 0xff, 0xff]);
  expect(extractTrailingData(source, "image/jpeg")).toBeNull();
});

test("extractTrailingData returns null when JPEG has no EOI marker", () => {
  const source = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, // valid APP0 segment
  ]);
  expect(extractTrailingData(source, "image/jpeg")).toBeNull();
});

test("extractTrailingData returns null for unsupported format", () => {
  const source = buildPngBytes([0x01]);
  expect(extractTrailingData(source, "image/gif" as never)).toBeNull();
});

test("extractTrailingData returns null when PNG has no IEND chunk", () => {
  const source = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    0x00, 0x00, 0x00, 0x00, // zero-length chunk
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x00, // crc
  ]);
  expect(extractTrailingData(source, "image/png")).toBeNull();
});
