export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const size = bytes / 1024 ** exponent;

  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

const COMMA_GROUPED_INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatCommaGroupedInteger(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return COMMA_GROUPED_INTEGER_FORMATTER.format(Math.trunc(value));
}

export function formatByteCountWithHuman(bytes: number): string {
  return `${formatCommaGroupedInteger(bytes)} bytes (${formatBytes(bytes)})`;
}
