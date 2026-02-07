export type CarvedPayloadKind =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "bmp"
  | "tiff"
  | "pdf"
  | "zip";

export type PayloadConfidence = "high" | "medium" | "low";

export interface CarvedPayload {
  id: string;
  kind: CarvedPayloadKind;
  label: string;
  extension: string;
  mimeType: string;
  signature: string;
  startOffset: number;
  endOffset: number;
  byteLength: number;
  confidence: PayloadConfidence;
  strategy: string;
}

export interface PayloadCarvingOptions {
  maxFindings?: number;
}

interface SignatureSpec {
  kind: CarvedPayloadKind;
  label: string;
  extension: string;
  mimeType: string;
  signature: string;
  strategy: string;
  matchAt: (bytes: Uint8Array, offset: number) => boolean;
  findEnd: (bytes: Uint8Array, startOffset: number) => number | null;
}

interface Candidate {
  spec: SignatureSpec;
  startOffset: number;
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const GIF87A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const TIFF_LE_SIGNATURE = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
const TIFF_BE_SIGNATURE = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]);
const RIFF_SIGNATURE = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const WEBP_SIGNATURE = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const PDF_EOF_MARKER = new Uint8Array([0x25, 0x25, 0x45, 0x4f, 0x46]); // %%EOF
const ZIP_LOCAL_FILE_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EOCD_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  pattern: Uint8Array,
): boolean {
  if (offset < 0 || offset + pattern.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < pattern.length; index += 1) {
    if (bytes[offset + index] !== pattern[index]) {
      return false;
    }
  }

  return true;
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) {
    return null;
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) {
    return null;
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function findNextPattern(
  bytes: Uint8Array,
  pattern: Uint8Array,
  fromOffset: number,
): number {
  const startOffset = Math.max(0, fromOffset);
  for (
    let offset = startOffset;
    offset + pattern.length <= bytes.length;
    offset += 1
  ) {
    if (matchesAt(bytes, offset, pattern)) {
      return offset;
    }
  }
  return -1;
}

function findPngEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (!matchesAt(bytes, startOffset, PNG_SIGNATURE)) {
    return null;
  }

  let offset = startOffset + PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    if (chunkLength === null) {
      return null;
    }

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

function findJpegEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (
    startOffset + 3 > bytes.length ||
    bytes[startOffset] !== 0xff ||
    bytes[startOffset + 1] !== 0xd8 ||
    bytes[startOffset + 2] !== 0xff
  ) {
    return null;
  }

  let offset = startOffset + 2;
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

    const segmentLength = readUint16BE(bytes, markerOffset + 1);
    if (segmentLength === null || segmentLength < 2) {
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

function findGifEnd(bytes: Uint8Array, startOffset: number): number | null {
  const hasHeader =
    matchesAt(bytes, startOffset, GIF87A_SIGNATURE) ||
    matchesAt(bytes, startOffset, GIF89A_SIGNATURE);
  if (!hasHeader) {
    return null;
  }

  if (startOffset + 13 > bytes.length) {
    return null;
  }

  let offset = startOffset + 13;
  const packedGlobal = bytes[startOffset + 10];
  if ((packedGlobal & 0x80) !== 0) {
    const tableSize = 3 * (1 << ((packedGlobal & 0x07) + 1));
    offset += tableSize;
    if (offset > bytes.length) {
      return null;
    }
  }

  while (offset < bytes.length) {
    const sentinel = bytes[offset];
    offset += 1;

    if (sentinel === 0x3b) {
      return offset;
    }

    if (sentinel === 0x2c) {
      if (offset + 9 > bytes.length) {
        return null;
      }

      const packedLocal = bytes[offset + 8];
      offset += 9;
      if ((packedLocal & 0x80) !== 0) {
        const localTableSize = 3 * (1 << ((packedLocal & 0x07) + 1));
        offset += localTableSize;
        if (offset > bytes.length) {
          return null;
        }
      }

      if (offset >= bytes.length) {
        return null;
      }
      offset += 1; // LZW minimum code size

      while (offset < bytes.length) {
        const blockSize = bytes[offset];
        offset += 1;
        if (blockSize === 0) {
          break;
        }
        offset += blockSize;
        if (offset > bytes.length) {
          return null;
        }
      }
      continue;
    }

    if (sentinel === 0x21) {
      if (offset >= bytes.length) {
        return null;
      }

      const extensionLabel = bytes[offset];
      offset += 1;

      if (extensionLabel === 0xf9) {
        if (offset >= bytes.length) {
          return null;
        }
        const blockSize = bytes[offset];
        offset += 1 + blockSize;
        if (offset >= bytes.length || bytes[offset] !== 0x00) {
          return null;
        }
        offset += 1;
        continue;
      }

      if (offset >= bytes.length) {
        return null;
      }
      const firstBlockSize = bytes[offset];
      offset += 1 + firstBlockSize;
      if (offset > bytes.length) {
        return null;
      }

      while (offset < bytes.length) {
        const blockSize = bytes[offset];
        offset += 1;
        if (blockSize === 0) {
          break;
        }
        offset += blockSize;
        if (offset > bytes.length) {
          return null;
        }
      }
      continue;
    }

    return null;
  }

  return null;
}

function findWebpEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (
    !matchesAt(bytes, startOffset, RIFF_SIGNATURE) ||
    !matchesAt(bytes, startOffset + 8, WEBP_SIGNATURE)
  ) {
    return null;
  }

  const riffPayloadLength = readUint32LE(bytes, startOffset + 4);
  if (riffPayloadLength === null) {
    return null;
  }

  const endOffset = startOffset + 8 + riffPayloadLength;
  if (endOffset > bytes.length || endOffset <= startOffset + 8) {
    return null;
  }

  return endOffset;
}

function findBmpEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (
    startOffset + 6 > bytes.length ||
    bytes[startOffset] !== 0x42 ||
    bytes[startOffset + 1] !== 0x4d
  ) {
    return null;
  }

  const size = readUint32LE(bytes, startOffset + 2);
  if (size === null || size < 26) {
    return null;
  }

  const endOffset = startOffset + size;
  if (endOffset > bytes.length) {
    return null;
  }

  return endOffset;
}

function findPdfEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (!matchesAt(bytes, startOffset, PDF_SIGNATURE)) {
    return null;
  }

  let searchOffset = startOffset + PDF_SIGNATURE.length;
  let lastEofOffset = -1;

  while (searchOffset + PDF_EOF_MARKER.length <= bytes.length) {
    const found = findNextPattern(bytes, PDF_EOF_MARKER, searchOffset);
    if (found < 0) {
      break;
    }

    lastEofOffset = found;
    searchOffset = found + PDF_EOF_MARKER.length;
  }

  if (lastEofOffset < 0) {
    return null;
  }

  let endOffset = lastEofOffset + PDF_EOF_MARKER.length;
  while (endOffset < bytes.length) {
    const value = bytes[endOffset];
    if (value === 0x0d || value === 0x0a || value === 0x20 || value === 0x09) {
      endOffset += 1;
      continue;
    }
    break;
  }

  return endOffset;
}

function findZipEnd(bytes: Uint8Array, startOffset: number): number | null {
  if (!matchesAt(bytes, startOffset, ZIP_LOCAL_FILE_SIGNATURE)) {
    return null;
  }

  for (
    let offset = startOffset + ZIP_LOCAL_FILE_SIGNATURE.length;
    offset + 22 <= bytes.length;
    offset += 1
  ) {
    if (!matchesAt(bytes, offset, ZIP_EOCD_SIGNATURE)) {
      continue;
    }

    const commentLength = readUint16LE(bytes, offset + 20);
    if (commentLength === null) {
      continue;
    }

    const endOffset = offset + 22 + commentLength;
    if (endOffset <= bytes.length) {
      return endOffset;
    }
  }

  return null;
}

function matchWebpAt(bytes: Uint8Array, offset: number): boolean {
  return (
    matchesAt(bytes, offset, RIFF_SIGNATURE) &&
    matchesAt(bytes, offset + 8, WEBP_SIGNATURE)
  );
}

const SIGNATURE_SPECS: ReadonlyArray<SignatureSpec> = [
  {
    kind: "png",
    label: "PNG image",
    extension: "png",
    mimeType: "image/png",
    signature: "PNG signature",
    strategy: "Parsed PNG chunks through IEND.",
    matchAt: (bytes, offset) => matchesAt(bytes, offset, PNG_SIGNATURE),
    findEnd: findPngEnd,
  },
  {
    kind: "jpeg",
    label: "JPEG image",
    extension: "jpg",
    mimeType: "image/jpeg",
    signature: "JPEG SOI marker",
    strategy: "Parsed JPEG markers through EOI.",
    matchAt: (bytes, offset) =>
      offset + 3 <= bytes.length &&
      bytes[offset] === 0xff &&
      bytes[offset + 1] === 0xd8 &&
      bytes[offset + 2] === 0xff,
    findEnd: findJpegEnd,
  },
  {
    kind: "gif",
    label: "GIF image",
    extension: "gif",
    mimeType: "image/gif",
    signature: "GIF87a/GIF89a header",
    strategy: "Parsed GIF block stream through trailer.",
    matchAt: (bytes, offset) =>
      matchesAt(bytes, offset, GIF87A_SIGNATURE) ||
      matchesAt(bytes, offset, GIF89A_SIGNATURE),
    findEnd: findGifEnd,
  },
  {
    kind: "webp",
    label: "WebP image",
    extension: "webp",
    mimeType: "image/webp",
    signature: "RIFF WEBP header",
    strategy: "Used RIFF container length.",
    matchAt: matchWebpAt,
    findEnd: findWebpEnd,
  },
  {
    kind: "bmp",
    label: "BMP image",
    extension: "bmp",
    mimeType: "image/bmp",
    signature: "BM header",
    strategy: "Used BMP file size field.",
    matchAt: (bytes, offset) =>
      offset + 2 <= bytes.length &&
      bytes[offset] === 0x42 &&
      bytes[offset + 1] === 0x4d,
    findEnd: findBmpEnd,
  },
  {
    kind: "tiff",
    label: "TIFF image",
    extension: "tiff",
    mimeType: "image/tiff",
    signature: "TIFF byte-order header",
    strategy: "No reliable TIFF end marker; used signature boundary fallback.",
    matchAt: (bytes, offset) =>
      matchesAt(bytes, offset, TIFF_LE_SIGNATURE) ||
      matchesAt(bytes, offset, TIFF_BE_SIGNATURE),
    findEnd: () => null,
  },
  {
    kind: "pdf",
    label: "PDF document",
    extension: "pdf",
    mimeType: "application/pdf",
    signature: "PDF header",
    strategy: "Searched for final %%EOF marker.",
    matchAt: (bytes, offset) => matchesAt(bytes, offset, PDF_SIGNATURE),
    findEnd: findPdfEnd,
  },
  {
    kind: "zip",
    label: "ZIP archive",
    extension: "zip",
    mimeType: "application/zip",
    signature: "ZIP local file header",
    strategy: "Parsed ZIP EOCD footer.",
    matchAt: (bytes, offset) =>
      matchesAt(bytes, offset, ZIP_LOCAL_FILE_SIGNATURE),
    findEnd: findZipEnd,
  },
];

function gatherCandidates(bytes: Uint8Array): Candidate[] {
  const candidates: Candidate[] = [];
  const dedupe = new Set<string>();

  for (let offset = 0; offset < bytes.length; offset += 1) {
    for (const spec of SIGNATURE_SPECS) {
      if (!spec.matchAt(bytes, offset)) {
        continue;
      }

      const key = `${spec.kind}|${offset}`;
      if (dedupe.has(key)) {
        continue;
      }

      dedupe.add(key);
      candidates.push({ spec, startOffset: offset });
    }
  }

  return candidates.sort((a, b) => a.startOffset - b.startOffset);
}

function findNextCandidateOffset(
  sortedStartOffsets: number[],
  currentStartOffset: number,
): number | null {
  for (const offset of sortedStartOffsets) {
    if (offset > currentStartOffset) {
      return offset;
    }
  }
  return null;
}

export function detectCarvedPayloads(
  bytes: Uint8Array,
  options: PayloadCarvingOptions = {},
): CarvedPayload[] {
  if (bytes.length === 0) {
    return [];
  }

  const maxFindings = Math.max(0, options.maxFindings ?? 24);
  if (maxFindings === 0) {
    return [];
  }

  const candidates = gatherCandidates(bytes);
  if (candidates.length === 0) {
    return [];
  }

  const candidateOffsets = candidates.map((candidate) => candidate.startOffset);
  const matches: CarvedPayload[] = [];
  const dedupe = new Set<string>();

  for (const candidate of candidates) {
    let endOffset = candidate.spec.findEnd(bytes, candidate.startOffset);
    let confidence: PayloadConfidence =
      candidate.spec.kind === "pdf" ? "medium" : "high";
    let strategy = candidate.spec.strategy;

    if (
      endOffset === null ||
      endOffset <= candidate.startOffset ||
      endOffset > bytes.length
    ) {
      const nextStartOffset = findNextCandidateOffset(
        candidateOffsets,
        candidate.startOffset,
      );
      endOffset = nextStartOffset ?? bytes.length;
      if (endOffset <= candidate.startOffset) {
        continue;
      }

      confidence = "low";
      strategy = "Signature matched; carved to next signature/end of scan.";
    }

    const key = `${candidate.spec.kind}|${candidate.startOffset}|${endOffset}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);

    matches.push({
      id: key,
      kind: candidate.spec.kind,
      label: candidate.spec.label,
      extension: candidate.spec.extension,
      mimeType: candidate.spec.mimeType,
      signature: candidate.spec.signature,
      startOffset: candidate.startOffset,
      endOffset,
      byteLength: endOffset - candidate.startOffset,
      confidence,
      strategy,
    });

    if (matches.length >= maxFindings) {
      break;
    }
  }

  return matches;
}

// Exposed for targeted unit tests of parser edge cases.
export const __payloadCarvingInternals = {
  matchesAt,
  readUint16LE,
  readUint16BE,
  readUint32LE,
  readUint32BE,
  findNextPattern,
  findPngEnd,
  findJpegEnd,
  findGifEnd,
  findWebpEnd,
  findBmpEnd,
  findPdfEnd,
  findZipEnd,
  gatherCandidates,
  findNextCandidateOffset,
};
