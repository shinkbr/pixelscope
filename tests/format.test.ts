import { expect, test } from "vitest";
import { formatBytes } from "../src/utils/format.ts";

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
