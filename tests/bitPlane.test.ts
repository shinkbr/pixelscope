import assert from "node:assert/strict";
import test from "node:test";
import { extractBitPlane, extractBitPlaneStream, extractCombinedBitPlanes } from "../src/utils/bitPlane.ts";
import type { BitExtractionOptions, PlaneSpec } from "../src/types";

const DEFAULT_OPTIONS: BitExtractionOptions = {
  scanOrder: "row-major",
  channelOrder: "rgba",
  bitOrder: "lsb-to-msb",
  bytePackOrder: "msb-first",
};

class MockImageData {
  public data: Uint8ClampedArray;
  public width: number;
  public height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

globalThis.ImageData = MockImageData as unknown as typeof ImageData;

function plane(channelOffset: number, bitPosition: number, id: string): PlaneSpec {
  const channel = channelOffset === 0 ? "r" : channelOffset === 1 ? "g" : channelOffset === 2 ? "b" : "a";
  const label = channel === "r" ? "Red" : channel === "g" ? "Green" : channel === "b" ? "Blue" : "Alpha";

  return {
    id,
    channel,
    channelLabel: label,
    channelOffset,
    bitPosition,
    bitMask: 1 << (bitPosition - 1),
    label: id,
  };
}

function imageData(width: number, height: number, rgbaBytes: number[]): ImageData {
  return {
    data: new Uint8ClampedArray(rgbaBytes),
    width,
    height,
  } as ImageData;
}

test("extractBitPlaneStream uses row-major scan by default", () => {
  const red1 = plane(0, 1, "r-1");
  const img = imageData(2, 2, [
    1, 0, 0, 255, // (0,0)
    0, 0, 0, 255, // (1,0)
    1, 0, 0, 255, // (0,1)
    0, 0, 0, 255, // (1,1)
  ]);

  const out = extractBitPlaneStream(img, [red1], DEFAULT_OPTIONS, 1);

  assert.equal(out.bitsPerPixel, 1);
  assert.equal(out.totalBits, 4);
  assert.equal(out.totalBytes, 1);
  assert.equal(out.bytes[0], 0b1010_0000);
});

test("extractBitPlaneStream supports column-major scan order", () => {
  const red1 = plane(0, 1, "r-1");
  const img = imageData(2, 2, [
    1, 0, 0, 255, // (0,0)
    0, 0, 0, 255, // (1,0)
    1, 0, 0, 255, // (0,1)
    0, 0, 0, 255, // (1,1)
  ]);

  const out = extractBitPlaneStream(
    img,
    [red1],
    {
      ...DEFAULT_OPTIONS,
      scanOrder: "column-major",
    },
    1,
  );

  assert.equal(out.bytes[0], 0b1100_0000);
});

test("extractBitPlaneStream respects selected channel order", () => {
  const red1 = plane(0, 1, "r-1");
  const green1 = plane(1, 1, "g-1");
  const img = imageData(2, 1, [
    1, 0, 0, 255, // pixel 0
    0, 1, 0, 255, // pixel 1
  ]);

  const rgba = extractBitPlaneStream(
    img,
    [red1, green1],
    {
      ...DEFAULT_OPTIONS,
      channelOrder: "rgba",
    },
    1,
  );
  const bgra = extractBitPlaneStream(
    img,
    [red1, green1],
    {
      ...DEFAULT_OPTIONS,
      channelOrder: "bgra",
    },
    1,
  );

  assert.equal(rgba.bytes[0], 0b1001_0000);
  assert.equal(bgra.bytes[0], 0b0110_0000);
});

test("extractBitPlaneStream respects selected bit order", () => {
  const red1 = plane(0, 1, "r-1");
  const red2 = plane(0, 2, "r-2");
  const img = imageData(2, 1, [
    1, 0, 0, 255, // pixel 0 red: 00000001
    2, 0, 0, 255, // pixel 1 red: 00000010
  ]);

  const lsbToMsb = extractBitPlaneStream(
    img,
    [red1, red2],
    {
      ...DEFAULT_OPTIONS,
      bitOrder: "lsb-to-msb",
    },
    1,
  );
  const msbToLsb = extractBitPlaneStream(
    img,
    [red1, red2],
    {
      ...DEFAULT_OPTIONS,
      bitOrder: "msb-to-lsb",
    },
    1,
  );

  assert.equal(lsbToMsb.bytes[0], 0b1001_0000);
  assert.equal(msbToLsb.bytes[0], 0b0110_0000);
});

test("extractBitPlaneStream supports byte packing direction", () => {
  const red1 = plane(0, 1, "r-1");
  const img = imageData(3, 1, [
    1, 0, 0, 255,
    0, 0, 0, 255,
    1, 0, 0, 255,
  ]);

  const msbFirst = extractBitPlaneStream(
    img,
    [red1],
    {
      ...DEFAULT_OPTIONS,
      bytePackOrder: "msb-first",
    },
    1,
  );
  const lsbFirst = extractBitPlaneStream(
    img,
    [red1],
    {
      ...DEFAULT_OPTIONS,
      bytePackOrder: "lsb-first",
    },
    1,
  );

  assert.equal(msbFirst.bytes[0], 0b1010_0000);
  assert.equal(lsbFirst.bytes[0], 0b0000_0101);
});

test("extractBitPlane returns binary monochrome output", () => {
  const red1 = plane(0, 1, "r-1");
  const img = imageData(2, 1, [
    1, 0, 0, 10,
    0, 0, 0, 20,
  ]);

  const out = extractBitPlane(img, red1);

  assert.deepEqual(Array.from(out.data), [
    255, 255, 255, 255,
    0, 0, 0, 255,
  ]);
});

test("extractCombinedBitPlanes uses logical OR across selected planes", () => {
  const red1 = plane(0, 1, "r-1");
  const green1 = plane(1, 1, "g-1");
  const img = imageData(2, 1, [
    1, 0, 0, 255,
    0, 1, 0, 255,
  ]);

  const out = extractCombinedBitPlanes(img, [red1, green1]);

  assert.deepEqual(Array.from(out.data), [
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);
});
