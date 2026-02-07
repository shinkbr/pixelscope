import { expect, test } from "vitest";
import {
  __payloadCarvingInternals,
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

function buildGifBytesWithImageData(): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // GIF89a
    0x01,
    0x00,
    0x01,
    0x00, // width/height
    0x00, // no global color table
    0x00, // bg color
    0x00, // aspect ratio
    0x2c, // image descriptor
    0x00,
    0x00,
    0x00,
    0x00, // left/top
    0x01,
    0x00,
    0x01,
    0x00, // image width/height
    0x00, // no local color table
    0x02, // LZW minimum code size
    0x02, // data block size
    0x4c,
    0x01, // data
    0x00, // block terminator
    0x3b, // trailer
  ]);
}

function buildGifBytesWithExtensionAndGce(): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // GIF89a
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00, // logical screen descriptor
    0x21,
    0xf9, // graphics control extension
    0x04,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // gce terminator
    0x21,
    0xfe, // comment extension
    0x01,
    0x41,
    0x00, // comment terminator
    0x2c, // image descriptor
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x02,
    0x02,
    0x4c,
    0x01,
    0x00,
    0x3b,
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

test("detectCarvedPayloads handles maxFindings=0 and no signatures", () => {
  expect(
    detectCarvedPayloads(new Uint8Array([1, 2, 3]), { maxFindings: 0 }),
  ).toEqual([]);
  expect(detectCarvedPayloads(new Uint8Array([1, 2, 3]))).toEqual([]);
});

test("internals parse GIF image blocks and extension blocks", () => {
  const withImage = buildGifBytesWithImageData();
  const withExt = buildGifBytesWithExtensionAndGce();

  expect(__payloadCarvingInternals.findGifEnd(withImage, 0)).toBe(
    withImage.length,
  );
  expect(__payloadCarvingInternals.findGifEnd(withExt, 0)).toBe(withExt.length);
});

test("internals return null for malformed GIF branches", () => {
  const badHeader = new Uint8Array([0x47, 0x49, 0x46, 0x00]);
  const badImageDescriptor = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00,
  ]);
  const badSentinel = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x77,
  ]);

  expect(__payloadCarvingInternals.findGifEnd(badHeader, 0)).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(badImageDescriptor, 0),
  ).toBeNull();
  expect(__payloadCarvingInternals.findGifEnd(badSentinel, 0)).toBeNull();
});

test("internals exercise malformed container branches", () => {
  const malformedPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff, 0xff,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const malformedJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01]);
  const webpBadLength = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0xff, 0xff, 0x57, 0x45, 0x42, 0x50,
  ]);
  const bmpBadSize = new Uint8Array([0x42, 0x4d, 0x10, 0x00, 0x00, 0x00]);
  const pdfNoEof = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\n");
  const zipNoEocd = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33]);
  const badPngHeader = new Uint8Array([0x00, 0x11, 0x22, 0x33]);
  const badPngChunkEnd = new Uint8Array([
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
    0x20, // declares data longer than available
    0x49,
    0x48,
    0x44,
    0x52,
  ]);

  expect(__payloadCarvingInternals.findPngEnd(badPngHeader, 0)).toBeNull();
  expect(__payloadCarvingInternals.findPngEnd(malformedPng, 0)).toBeNull();
  expect(__payloadCarvingInternals.findPngEnd(badPngChunkEnd, 0)).toBeNull();
  expect(__payloadCarvingInternals.findJpegEnd(malformedJpeg, 0)).toBeNull();
  expect(__payloadCarvingInternals.findWebpEnd(webpBadLength, 0)).toBeNull();
  expect(__payloadCarvingInternals.findBmpEnd(bmpBadSize, 0)).toBeNull();
  expect(__payloadCarvingInternals.findPdfEnd(pdfNoEof, 0)).toBeNull();
  expect(__payloadCarvingInternals.findZipEnd(zipNoEocd, 0)).toBeNull();
});

test("internals primitive helpers cover boundaries and offsets", () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const pattern = new Uint8Array([0x01, 0x02]);

  expect(__payloadCarvingInternals.matchesAt(bytes, 1, pattern)).toBe(true);
  expect(__payloadCarvingInternals.matchesAt(bytes, -1, pattern)).toBe(false);
  expect(__payloadCarvingInternals.readUint16LE(bytes, 0)).toBe(0x0100);
  expect(__payloadCarvingInternals.readUint16LE(bytes, 3)).toBeNull();
  expect(__payloadCarvingInternals.readUint16BE(bytes, 0)).toBe(0x0001);
  expect(__payloadCarvingInternals.readUint16BE(bytes, 3)).toBeNull();
  expect(__payloadCarvingInternals.readUint32LE(bytes, 0)).toBe(0x03020100);
  expect(__payloadCarvingInternals.readUint32LE(bytes, 1)).toBeNull();
  expect(__payloadCarvingInternals.readUint32BE(bytes, 0)).toBe(0x00010203);
  expect(__payloadCarvingInternals.readUint32BE(bytes, 1)).toBeNull();
  expect(__payloadCarvingInternals.findNextPattern(bytes, pattern, 0)).toBe(1);
  expect(__payloadCarvingInternals.findNextPattern(bytes, pattern, 2)).toBe(-1);
  expect(__payloadCarvingInternals.findNextCandidateOffset([1, 4, 9], 4)).toBe(
    9,
  );
  expect(
    __payloadCarvingInternals.findNextCandidateOffset([1, 4, 9], 9),
  ).toBeNull();
});

test("internals gatherCandidates and fallback path dedupe work", () => {
  const tiffAndPng = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x00, 0x00, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a,
    0x1a, 0x0a,
  ]);
  const candidates = __payloadCarvingInternals.gatherCandidates(tiffAndPng);
  expect(candidates.length).toBeGreaterThanOrEqual(2);

  const payloads = detectCarvedPayloads(tiffAndPng, { maxFindings: 8 });
  const tiffPayload = payloads.find((item) => item.kind === "tiff");
  expect(tiffPayload).toBeDefined();
  expect(tiffPayload?.confidence).toBe("low");
});

test("internals cover JPEG marker edge branches", () => {
  const noHeader = new Uint8Array([0x11, 0x22, 0x33]);
  const dataBetweenMarkers = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x11, 0x22, 0x11, 0xff, 0xd9,
  ]);
  const repeatedPrefix = new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd9]);
  const truncatedMarker = new Uint8Array([0xff, 0xd8, 0xff]);
  const stuffedMarker = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
  const standaloneMarker = new Uint8Array([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xd9]);
  const overrunSegment = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x01,
  ]);
  const noEoi = new Uint8Array([0xff, 0xd8, 0x11, 0x22, 0x33]);

  expect(__payloadCarvingInternals.findJpegEnd(noHeader, 0)).toBeNull();
  expect(__payloadCarvingInternals.findJpegEnd(dataBetweenMarkers, 0)).toBe(
    dataBetweenMarkers.length,
  );
  expect(__payloadCarvingInternals.findJpegEnd(repeatedPrefix, 0)).toBe(
    repeatedPrefix.length,
  );
  expect(__payloadCarvingInternals.findJpegEnd(truncatedMarker, 0)).toBeNull();
  expect(__payloadCarvingInternals.findJpegEnd(stuffedMarker, 0)).toBe(
    stuffedMarker.length,
  );
  expect(__payloadCarvingInternals.findJpegEnd(standaloneMarker, 0)).toBe(
    standaloneMarker.length,
  );
  expect(__payloadCarvingInternals.findJpegEnd(overrunSegment, 0)).toBeNull();
  expect(__payloadCarvingInternals.findJpegEnd(noEoi, 0)).toBeNull();
});

test("internals cover GIF malformed branches comprehensively", () => {
  const headerTooShort = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01,
  ]);
  const globalTableOverrun = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x87, // global table enabled with large size
    0x00,
    0x00,
  ]);
  const localTableOverrun = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x87, // local table enabled with large size
  ]);
  const noLzwCodeSize = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const oversizedImageBlock = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x02,
    0x09, // block larger than remaining bytes
    0x01,
  ]);
  const extensionWithoutLabel = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x21,
  ]);
  const gceWithoutBlockSize = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x21, 0xf9,
  ]);
  const gceWithoutTerminator = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x21,
    0xf9,
    0x04,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01, // not zero terminator
  ]);
  const genericExtensionTooShort = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x21, 0xfe,
  ]);
  const genericExtensionOverrun = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x21,
    0xfe,
    0x10, // first block too large
    0x41,
  ]);
  const genericExtensionSubblockOverrun = new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x21,
    0xfe,
    0x01,
    0x41,
    0x05, // next sub-block too large
    0x42,
  ]);

  expect(__payloadCarvingInternals.findGifEnd(headerTooShort, 0)).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(globalTableOverrun, 0),
  ).toBeNull();
  expect(__payloadCarvingInternals.findGifEnd(localTableOverrun, 0)).toBeNull();
  expect(__payloadCarvingInternals.findGifEnd(noLzwCodeSize, 0)).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(oversizedImageBlock, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(extensionWithoutLabel, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(gceWithoutBlockSize, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(gceWithoutTerminator, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(genericExtensionTooShort, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(genericExtensionOverrun, 0),
  ).toBeNull();
  expect(
    __payloadCarvingInternals.findGifEnd(genericExtensionSubblockOverrun, 0),
  ).toBeNull();
});

test("internals cover remaining format boundary branches", () => {
  const webpNoSignature = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]);
  const webpZeroSize = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const bmpHeaderOnly = new Uint8Array([0x42, 0x4d, 0x1a, 0x00, 0x00, 0x00]);
  const bmpValid = new Uint8Array([
    0x42, 0x4d, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1a, 0x00,
    0x00, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x18, 0x00,
  ]);
  const pdfNoHeader = new TextEncoder().encode("not a pdf");
  const pdfWithTail = new TextEncoder().encode("%PDF-1.4\n%%EOFX");
  const zipNoHeader = new Uint8Array([0x11, 0x22, 0x33]);

  expect(__payloadCarvingInternals.findWebpEnd(webpNoSignature, 0)).toBeNull();
  expect(__payloadCarvingInternals.findWebpEnd(webpZeroSize, 0)).toBeNull();
  expect(__payloadCarvingInternals.findBmpEnd(bmpHeaderOnly, 0)).toBeNull();
  expect(__payloadCarvingInternals.findBmpEnd(bmpValid, 0)).toBe(
    bmpValid.length,
  );
  expect(__payloadCarvingInternals.findPdfEnd(pdfNoHeader, 0)).toBeNull();
  expect(__payloadCarvingInternals.findPdfEnd(pdfWithTail, 0)).toBe(
    "%PDF-1.4\n%%EOF".length,
  );
  expect(__payloadCarvingInternals.findZipEnd(zipNoHeader, 0)).toBeNull();
});
