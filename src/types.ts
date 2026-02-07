export type ChannelKey = "r" | "g" | "b" | "a";
export type ExtractionScanOrder = "row-major" | "column-major";
export type ExtractionChannelOrder = "rgba" | "bgra" | "argb" | "abgr";
export type ExtractionBitOrder = "lsb-to-msb" | "msb-to-lsb";
export type ExtractionBytePackOrder = "msb-first" | "lsb-first";

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
