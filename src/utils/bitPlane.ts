import type { BitExtractionOptions, ChannelKey, PlaneSpec } from "../types";

const CHANNELS: ReadonlyArray<{
  key: ChannelKey;
  label: PlaneSpec["channelLabel"];
  offset: number;
}> = [
  { key: "r", label: "Red", offset: 0 },
  { key: "g", label: "Green", offset: 1 },
  { key: "b", label: "Blue", offset: 2 },
  { key: "a", label: "Alpha", offset: 3 },
];

const CHANNEL_ORDER_MAP: Record<BitExtractionOptions["channelOrder"], ReadonlyArray<ChannelKey>> = {
  rgba: ["r", "g", "b", "a"],
  bgra: ["b", "g", "r", "a"],
  argb: ["a", "r", "g", "b"],
  abgr: ["a", "b", "g", "r"],
};

const BIT_ORDER_MAP: Record<BitExtractionOptions["bitOrder"], ReadonlyArray<number>> = {
  "lsb-to-msb": [1, 2, 3, 4, 5, 6, 7, 8],
  "msb-to-lsb": [8, 7, 6, 5, 4, 3, 2, 1],
};

export function buildPlaneSpecs(): PlaneSpec[] {
  const planes: PlaneSpec[] = [];

  for (const channel of CHANNELS) {
    for (let bitPosition = 1; bitPosition <= 8; bitPosition += 1) {
      const bitMask = 1 << (bitPosition - 1);
      planes.push({
        id: `${channel.key}-${bitPosition}`,
        channel: channel.key,
        channelLabel: channel.label,
        channelOffset: channel.offset,
        bitPosition,
        bitMask,
        label: `${channel.label} ${bitPosition}`,
      });
    }
  }

  return planes;
}

export function extractBitPlane(imageData: ImageData, plane: PlaneSpec): ImageData {
  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);

  for (let index = 0; index < source.length; index += 4) {
    const planeBitIsSet = (source[index + plane.channelOffset] & plane.bitMask) !== 0;
    const value = planeBitIsSet ? 255 : 0;

    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function isAnyPlaneBitSet(source: Uint8ClampedArray, sourceIndex: number, planes: PlaneSpec[]): boolean {
  for (const plane of planes) {
    if ((source[sourceIndex + plane.channelOffset] & plane.bitMask) !== 0) {
      return true;
    }
  }
  return false;
}

export function extractCombinedBitPlanes(imageData: ImageData, planes: PlaneSpec[]): ImageData {
  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);

  if (planes.length === 0) {
    for (let index = 0; index < output.length; index += 4) {
      output[index + 3] = 255;
    }
    return new ImageData(output, imageData.width, imageData.height);
  }

  for (let index = 0; index < source.length; index += 4) {
    const combinedBitIsSet = isAnyPlaneBitSet(source, index, planes);
    const value = combinedBitIsSet ? 255 : 0;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

// Extract selected planes as an ordered bitstream, then repack into bytes.
function orderSelectedPlanes(planes: PlaneSpec[], options: BitExtractionOptions): PlaneSpec[] {
  const selectedPlaneLookup = new Map<string, PlaneSpec>();
  for (const plane of planes) {
    selectedPlaneLookup.set(plane.id, plane);
  }

  const ordered: PlaneSpec[] = [];
  const bitOrder = BIT_ORDER_MAP[options.bitOrder];

  for (const channel of CHANNEL_ORDER_MAP[options.channelOrder]) {
    for (const bitPosition of bitOrder) {
      const plane = selectedPlaneLookup.get(`${channel}-${bitPosition}`);
      if (plane) {
        ordered.push(plane);
      }
    }
  }

  return ordered;
}

export interface ExtractedBitPlaneStream {
  bytes: Uint8Array;
  totalBits: number;
  totalBytes: number;
  bitsPerPixel: number;
}

export function extractBitPlaneStream(
  imageData: ImageData,
  planes: PlaneSpec[],
  options: BitExtractionOptions,
  maxBytes: number,
): ExtractedBitPlaneStream {
  const orderedPlanes = orderSelectedPlanes(planes, options);
  const bitsPerPixel = orderedPlanes.length;
  const totalBits = imageData.width * imageData.height * bitsPerPixel;
  const totalBytes = Math.ceil(totalBits / 8);
  const clampedMaxBytes = Math.max(0, maxBytes);
  const bytesToPack = Math.min(totalBytes, clampedMaxBytes);
  const bytes = new Uint8Array(bytesToPack);
  const source = imageData.data;

  if (bitsPerPixel === 0 || bytesToPack === 0 || totalBits === 0) {
    return { bytes, totalBits, totalBytes, bitsPerPixel };
  }

  const bitsToPack = Math.min(totalBits, bytesToPack * 8);
  let emittedBits = 0;

  const processPixel = (pixelStartIndex: number): boolean => {
    for (const plane of orderedPlanes) {
      if (emittedBits >= bitsToPack) {
        return true;
      }

      const planeBitIsSet = (source[pixelStartIndex + plane.channelOffset] & plane.bitMask) !== 0;
      if (planeBitIsSet) {
        const byteIndex = emittedBits >> 3;
        const bitPositionInByte =
          options.bytePackOrder === "msb-first" ? 7 - (emittedBits & 0b111) : emittedBits & 0b111;
        bytes[byteIndex] |= 1 << bitPositionInByte;
      }

      emittedBits += 1;
    }

    return emittedBits >= bitsToPack;
  };

  if (options.scanOrder === "row-major") {
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const pixelStartIndex = (y * imageData.width + x) * 4;
        if (processPixel(pixelStartIndex)) {
          return { bytes, totalBits, totalBytes, bitsPerPixel };
        }
      }
    }
  } else {
    for (let x = 0; x < imageData.width; x += 1) {
      for (let y = 0; y < imageData.height; y += 1) {
        const pixelStartIndex = (y * imageData.width + x) * 4;
        if (processPixel(pixelStartIndex)) {
          return { bytes, totalBits, totalBytes, bitsPerPixel };
        }
      }
    }
  }

  return { bytes, totalBits, totalBytes, bitsPerPixel };
}
