export type ChannelKey = "r" | "g" | "b" | "a";
export type ExtractionScanOrder = "row-major" | "column-major";
export type ExtractionChannelOrder = "rgba" | "bgra" | "argb" | "abgr";
export type ExtractionBitOrder = "lsb-to-msb" | "msb-to-lsb";
export type ExtractionBytePackOrder = "msb-first" | "lsb-first";
export type ExifGroup = "ifd0" | "exif" | "gps" | "interop" | "ifd1";

export interface ExifEntry {
  group: ExifGroup;
  tagId: number;
  tagName: string;
  value: string;
}

export interface ExifMetadata {
  source: "exifr";
  entries: ExifEntry[];
}

export interface BitExtractionOptions {
  scanOrder: ExtractionScanOrder;
  channelOrder: ExtractionChannelOrder;
  bitOrder: ExtractionBitOrder;
  bytePackOrder: ExtractionBytePackOrder;
}

export interface DecodedImage {
  filename: string;
  format: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  imageData: ImageData;
  exif: ExifMetadata | null;
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
