import { expect, test } from "vitest";
import {
  detectCarvedPayloads,
  type CarvedPayload,
} from "../src/utils/payloadCarving.ts";

function buildPngBytes(): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d, // IHDR length
    0x49,
    0x48,
    0x44,
    0x52, // IHDR type
    0x00,
    0x00,
    0x00,
    0x01, // width
    0x00,
    0x00,
    0x00,
    0x01, // height
    0x08,
    0x02,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // IHDR crc
    0x00,
    0x00,
    0x00,
    0x00, // IEND length
    0x49,
    0x45,
    0x4e,
    0x44, // IEND
    0xae,
    0x42,
    0x60,
    0x82, // IEND crc
  ]);
}

function buildJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0, // APP0
    0x00,
    0x04,
    0x11,
    0x22, // segment payload
    0xff,
    0xd9, // EOI
  ]);
}

function buildWebpBytes(): Uint8Array {
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // RIFF
    0x04,
    0x00,
    0x00,
    0x00, // RIFF payload length
    0x57,
    0x45,
    0x42,
    0x50, // WEBP
  ]);
}

function buildZipBytes(): Uint8Array {
  return new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04, // local file header
    0x14,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x50,
    0x4b,
    0x05,
    0x06, // EOCD
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

function findPayload(
  payloads: CarvedPayload[],
  kind: CarvedPayload["kind"],
): CarvedPayload | undefined {
  return payloads.find((payload) => payload.kind === kind);
}

test("detectCarvedPayloads returns empty for empty input", () => {
  expect(detectCarvedPayloads(new Uint8Array(0))).toEqual([]);
});

test("detectCarvedPayloads detects PNG and computes end via IEND", () => {
  const prefix = new Uint8Array([0xaa, 0xbb, 0xcc]);
  const png = buildPngBytes();
  const bytes = new Uint8Array(prefix.length + png.length + 2);
  bytes.set(prefix, 0);
  bytes.set(png, prefix.length);
  bytes.set([0xde, 0xad], prefix.length + png.length);

  const payloads = detectCarvedPayloads(bytes);
  const pngPayload = findPayload(payloads, "png");

  expect(pngPayload).toBeDefined();
  expect(pngPayload?.startOffset).toBe(prefix.length);
  expect(pngPayload?.endOffset).toBe(prefix.length + png.length);
  expect(pngPayload?.byteLength).toBe(png.length);
  expect(pngPayload?.confidence).toBe("high");
});

test("detectCarvedPayloads detects JPEG and ZIP payloads", () => {
  const jpeg = buildJpegBytes();
  const zip = buildZipBytes();
  const spacer = new Uint8Array([0x13, 0x37, 0x42]);
  const bytes = new Uint8Array(jpeg.length + spacer.length + zip.length);
  bytes.set(jpeg, 0);
  bytes.set(spacer, jpeg.length);
  bytes.set(zip, jpeg.length + spacer.length);

  const payloads = detectCarvedPayloads(bytes);
  const jpegPayload = findPayload(payloads, "jpeg");
  const zipPayload = findPayload(payloads, "zip");

  expect(jpegPayload?.startOffset).toBe(0);
  expect(jpegPayload?.endOffset).toBe(jpeg.length);
  expect(jpegPayload?.confidence).toBe("high");
  expect(zipPayload?.startOffset).toBe(jpeg.length + spacer.length);
  expect(zipPayload?.endOffset).toBe(bytes.length);
  expect(zipPayload?.confidence).toBe("high");
});

test("detectCarvedPayloads detects WebP payload using RIFF size", () => {
  const webp = buildWebpBytes();
  const bytes = new Uint8Array(webp.length + 4);
  bytes.set(webp, 0);
  bytes.set([0xfa, 0xfb, 0xfc, 0xfd], webp.length);

  const payloads = detectCarvedPayloads(bytes);
  const webpPayload = findPayload(payloads, "webp");

  expect(webpPayload).toBeDefined();
  expect(webpPayload?.startOffset).toBe(0);
  expect(webpPayload?.endOffset).toBe(webp.length);
  expect(webpPayload?.byteLength).toBe(webp.length);
});

test("detectCarvedPayloads falls back to next signature for TIFF payload", () => {
  const tiffStart = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
  ]);
  const filler = new Uint8Array([0x11, 0x22, 0x33]);
  const pngHeaderOnly = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const bytes = new Uint8Array(
    tiffStart.length + filler.length + pngHeaderOnly.length,
  );
  bytes.set(tiffStart, 0);
  bytes.set(filler, tiffStart.length);
  bytes.set(pngHeaderOnly, tiffStart.length + filler.length);

  const payloads = detectCarvedPayloads(bytes);
  const tiffPayload = findPayload(payloads, "tiff");

  expect(tiffPayload).toBeDefined();
  expect(tiffPayload?.startOffset).toBe(0);
  expect(tiffPayload?.endOffset).toBe(tiffStart.length + filler.length);
  expect(tiffPayload?.confidence).toBe("low");
});

test("detectCarvedPayloads parses PDF EOF and uses medium confidence", () => {
  const pdfText = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n";
  const encoder = new TextEncoder();
  const pdfBytes = encoder.encode(pdfText);

  const payloads = detectCarvedPayloads(pdfBytes);
  const pdfPayload = findPayload(payloads, "pdf");

  expect(pdfPayload).toBeDefined();
  expect(pdfPayload?.startOffset).toBe(0);
  expect(pdfPayload?.endOffset).toBe(pdfBytes.length);
  expect(pdfPayload?.confidence).toBe("medium");
});

test("detectCarvedPayloads respects maxFindings option", () => {
  const jpeg = buildJpegBytes();
  const zip = buildZipBytes();
  const stream = new Uint8Array(jpeg.length + zip.length + jpeg.length);
  stream.set(jpeg, 0);
  stream.set(zip, jpeg.length);
  stream.set(jpeg, jpeg.length + zip.length);

  const payloads = detectCarvedPayloads(stream, { maxFindings: 2 });
  expect(payloads).toHaveLength(2);
});
