import { expect, test } from "vitest";
import {
  formatByteCountWithHuman,
  formatBytes,
  formatCommaGroupedInteger,
} from "../src/utils/format.ts";

test("formatBytes formats zero bytes", () => {
  expect(formatBytes(0)).toBe("0 B");
});

test("formatBytes uses integer bytes for values under 1 KB", () => {
  expect(formatBytes(999)).toBe("999 B");
});

test("formatBytes formats KB and MB with rounding rules", () => {
  expect(formatBytes(1024)).toBe("1.0 KB");
  expect(formatBytes(10 * 1024)).toBe("10 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
});

test("formatBytes caps unit at GB", () => {
  expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
});

test("formatCommaGroupedInteger uses consistent comma-grouped format", () => {
  expect(formatCommaGroupedInteger(0)).toBe("0");
  expect(formatCommaGroupedInteger(4_481_592)).toBe("4,481,592");
  expect(formatCommaGroupedInteger(4_225_810)).toBe("4,225,810");
});

test("formatCommaGroupedInteger truncates fractional values", () => {
  expect(formatCommaGroupedInteger(10_000.99)).toBe("10,000");
});

test("formatByteCountWithHuman shows comma-grouped bytes and human size", () => {
  expect(formatByteCountWithHuman(4_225_810)).toBe("4,225,810 bytes (4.0 MB)");
  expect(formatByteCountWithHuman(1_234)).toBe("1,234 bytes (1.2 KB)");
  expect(formatByteCountWithHuman(0)).toBe("0 bytes (0 B)");
});
