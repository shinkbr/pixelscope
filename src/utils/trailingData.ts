import type { DecodedImage, TrailingData } from "../types";

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function findPngContainerEnd(bytes: Uint8Array): number | null {
  if (bytes.length < PNG_SIGNATURE.length) {
    return null;
  }

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return null;
    }
  }

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const chunkTypeOffset = offset + 4;
    const chunkEnd = chunkTypeOffset + 4 + chunkLength + 4;
    if (chunkEnd > bytes.length) {
      return null;
    }

    const isIend =
      bytes[chunkTypeOffset] === 0x49 &&
      bytes[chunkTypeOffset + 1] === 0x45 &&
      bytes[chunkTypeOffset + 2] === 0x4e &&
      bytes[chunkTypeOffset + 3] === 0x44;

    if (isIend) {
      return chunkEnd;
    }

    offset = chunkEnd;
  }

  return null;
}

function findJpegContainerEnd(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }

    if (markerOffset >= bytes.length) {
      return null;
    }

    const marker = bytes[markerOffset];

    if (marker === 0x00) {
      offset = markerOffset + 1;
      continue;
    }

    if (marker === 0xd9) {
      return markerOffset + 1;
    }

    const isStandaloneMarker =
      marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

    if (isStandaloneMarker) {
      offset = markerOffset + 1;
      continue;
    }

    if (markerOffset + 2 >= bytes.length) {
      return null;
    }

    const segmentLength =
      (bytes[markerOffset + 1] << 8) | bytes[markerOffset + 2];
    if (segmentLength < 2) {
      return null;
    }

    const segmentEnd = markerOffset + 1 + segmentLength;
    if (segmentEnd > bytes.length) {
      return null;
    }

    offset = segmentEnd;
  }

  return null;
}

function findContainerEndOffset(
  bytes: Uint8Array,
  format: DecodedImage["format"],
): number | null {
  if (format === "image/png") {
    return findPngContainerEnd(bytes);
  }

  if (format === "image/jpeg") {
    return findJpegContainerEnd(bytes);
  }

  return null;
}

export function extractTrailingData(
  bytes: Uint8Array,
  format: DecodedImage["format"],
): TrailingData | null {
  const containerEndOffset = findContainerEndOffset(bytes, format);
  if (containerEndOffset === null || containerEndOffset >= bytes.length) {
    return null;
  }

  return {
    containerEndOffset,
    byteLength: bytes.length - containerEndOffset,
    bytes: bytes.slice(containerEndOffset),
  };
}
