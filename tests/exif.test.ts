import { parse as parseExif } from "exifr";
import { beforeEach, expect, test, vi } from "vitest";
import { readExifMetadata } from "../src/utils/exif.ts";

vi.mock("exifr", () => ({
  parse: vi.fn(),
}));

const mockedParseExif = vi.mocked(parseExif);

function makeFile(name = "sample.jpg"): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type: "image/jpeg" });
}

beforeEach(() => {
  mockedParseExif.mockReset();
});

test("readExifMetadata returns null when parser throws", async () => {
  mockedParseExif.mockRejectedValueOnce(new Error("bad exif"));
  await expect(readExifMetadata(makeFile())).resolves.toBeNull();
});

test("readExifMetadata returns null when parser output is not an object", async () => {
  mockedParseExif.mockResolvedValueOnce("not-an-object");
  await expect(readExifMetadata(makeFile())).resolves.toBeNull();
});

test("readExifMetadata flattens objects, arrays, dates and binary values", async () => {
  const base64 = "QUJD".repeat(40);
  mockedParseExif.mockResolvedValueOnce({
    Make: "  Canon  ",
    gpsLatitude: [37.1, -122.3],
    interopData: { flag: true },
    thumbnailBlob: "thumb",
    exifIFD: {
      UserComment: base64,
      CaptureDate: new Date("2020-01-01T00:00:00.000Z"),
    },
    rawBytes: new Uint8Array([0x01, 0xab, 0xcd]),
    arrayBufferValue: new Uint8Array([0x10, 0x20]).buffer,
  });

  const metadata = await readExifMetadata(makeFile());

  expect(metadata?.source).toBe("exifr");
  expect(metadata?.entries.length).toBeGreaterThan(0);
  expect(metadata?.entries.some((entry) => entry.group === "ifd0" && entry.tagName === "Make" && entry.value === "Canon")).toBe(
    true,
  );
  expect(
    metadata?.entries.some(
      (entry) => entry.group === "gps" && entry.tagName === "gpsLatitude" && entry.value.includes("37.1, -122.3"),
    ),
  ).toBe(true);
  expect(metadata?.entries.some((entry) => entry.group === "interop" && entry.tagName === "interopData.flag")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.group === "ifd1" && entry.tagName === "thumbnailBlob")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.group === "exif" && entry.tagName === "exifIFD.CaptureDate")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "rawBytes" && entry.value.startsWith("0x01ABCD"))).toBe(true);
  expect(
    metadata?.entries.some((entry) => entry.tagName === "arrayBufferValue" && entry.value.startsWith("0x1020")),
  ).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName.startsWith("Base64Payload") && entry.value === base64)).toBe(true);
});

test("readExifMetadata uses serialized fallback for base64 when flattening yields no entries", async () => {
  const keyBase64 = "QUJD".repeat(35);
  mockedParseExif.mockResolvedValueOnce({
    [keyBase64]: [],
  });

  const metadata = await readExifMetadata(makeFile());

  expect(metadata?.entries.some((entry) => entry.tagName === "Base64Payload" && entry.value === keyBase64)).toBe(true);
});

test("readExifMetadata truncates overly long values", async () => {
  mockedParseExif.mockResolvedValueOnce({
    exifUserComment: "x".repeat(20_200),
  });

  const metadata = await readExifMetadata(makeFile());
  const entry = metadata?.entries.find((candidate) => candidate.tagName === "exifUserComment");

  expect(entry).toBeDefined();
  expect(entry?.value.endsWith(" …")).toBe(true);
  expect(entry?.value.length).toBe(20_002);
});

test("readExifMetadata covers edge primitive branches and multiple base64 payloads", async () => {
  const base64A = "QUJD".repeat(35);
  const base64B = "REVG".repeat(35);
  mockedParseExif.mockResolvedValueOnce({
    "": false,
    blankString: "   ",
    nonFiniteNumber: Number.POSITIVE_INFINITY,
    typedLarge: new Uint8Array(65).fill(0xab),
    bufferLarge: new Uint8Array(65).fill(0xcd).buffer,
    exifPayload: `${base64A},${base64B}`,
    mixedArray: [{ nested: "ok" }, 2],
  });

  const metadata = await readExifMetadata(makeFile());

  expect(metadata).not.toBeNull();
  expect(metadata?.entries.some((entry) => entry.tagName === "Value" && entry.value === "false")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "typedLarge" && entry.value.endsWith("..."))).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "bufferLarge" && entry.value.endsWith("..."))).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "Base64Payload1" && entry.value === base64A)).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "Base64Payload2" && entry.value === base64B)).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "mixedArray[0].nested" && entry.value === "ok")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName === "nonFiniteNumber")).toBe(false);
});

test("readExifMetadata enforces recursion depth limit", async () => {
  mockedParseExif.mockResolvedValueOnce({
    Keep: "ok",
    a: { b: { c: { d: { e: { f: { g: "secret" } } } } } },
  });

  const metadata = await readExifMetadata(makeFile());

  expect(metadata).not.toBeNull();
  expect(metadata?.entries.some((entry) => entry.tagName === "Keep" && entry.value === "ok")).toBe(true);
  expect(metadata?.entries.some((entry) => entry.tagName.includes("a.b.c.d.e.f.g"))).toBe(false);
});

test("readExifMetadata returns null when metadata has no extractable values", async () => {
  mockedParseExif.mockResolvedValueOnce({
    blank: "  ",
    nanValue: Number.NaN,
    emptyTypedArray: new Uint8Array(0),
    emptyArrayBuffer: new ArrayBuffer(0),
    nested: { list: [] },
  });

  await expect(readExifMetadata(makeFile())).resolves.toBeNull();
});
