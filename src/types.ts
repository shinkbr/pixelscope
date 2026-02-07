export type ChannelKey = "r" | "g" | "b" | "a";

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
