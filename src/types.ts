export type ChannelKey = "r" | "g" | "b" | "a";
export type ExtractionScanOrder = "row-major" | "column-major";
export type ExtractionChannelOrder = "rgba" | "bgra" | "argb" | "abgr";
export type ExtractionBitOrder = "lsb-to-msb" | "msb-to-lsb";
export type ExtractionBytePackOrder = "msb-first" | "lsb-first";
export type ExifGroup = "ifd0" | "exif" | "gps" | "interop" | "ifd1";
export type SupportedImageFormat =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/bmp"
  | "image/tiff"
  | "image/gif";

export interface ExifEntry {
  group: ExifGroup;
  tagId: number;
  tagName: string;
  value: string;
}

export interface ExifLocation {
  latitude: number;
  longitude: number;
}

export interface ExifMetadata {
  source: "exifr";
  entries: ExifEntry[];
  location: ExifLocation | null;
}

export interface TrailingData {
  containerEndOffset: number;
  byteLength: number;
  bytes: Uint8Array;
}

export interface BitExtractionOptions {
  scanOrder: ExtractionScanOrder;
  channelOrder: ExtractionChannelOrder;
  bitOrder: ExtractionBitOrder;
  bytePackOrder: ExtractionBytePackOrder;
}

export interface ImageFrame {
  imageData: ImageData;
  durationMs: number | null;
}

export interface DecodedImage {
  filename: string;
  format: SupportedImageFormat;
  byteSize: number;
  width: number;
  height: number;
  imageData: ImageData;
  frames: ImageFrame[];
  exif: ExifMetadata | null;
  trailingData: TrailingData | null;
}

export interface PlaneSpec {
  id: string;
  channel: ChannelKey;
  channelLabel: "Red" | "Green" | "Blue" | "Alpha";
  channelOffset: number;
  bitPosition: number;
  bitMask: number;
  label: string;
}
