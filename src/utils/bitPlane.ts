import type { ChannelKey, PlaneSpec } from "../types";

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
