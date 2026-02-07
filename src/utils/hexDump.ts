export interface HexDumpView {
  text: string;
  shownBytes: number;
  totalBytes: number;
  totalBits: number;
  isTruncated: boolean;
}

const BYTES_PER_LINE = 16;

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function byteToAscii(byte: number): string {
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
}

export function buildHexDump(
  bytes: Uint8Array,
  totalBytes: number,
  totalBits: number,
): HexDumpView {
  if (bytes.length === 0) {
    return {
      text: "",
      shownBytes: 0,
      totalBytes,
      totalBits,
      isTruncated: totalBytes > 0,
    };
  }

  const lines: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BYTES_PER_LINE) {
    const chunk = bytes.slice(offset, offset + BYTES_PER_LINE);
    const hex = Array.from(chunk, byteToHex)
      .join(" ")
      .padEnd(BYTES_PER_LINE * 3 - 1, " ");
    const ascii = Array.from(chunk, byteToAscii).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
  }

  return {
    text: lines.join("\n"),
    shownBytes: bytes.length,
    totalBytes,
    totalBits,
    isTruncated: bytes.length < totalBytes,
  };
}
