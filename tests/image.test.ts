import { readExifMetadata } from "../src/utils/exif.ts";
import { decodeImageFile } from "../src/utils/image.ts";
import { extractTrailingData } from "../src/utils/trailingData.ts";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/utils/exif.ts", () => ({
  readExifMetadata: vi.fn(),
}));

vi.mock("../src/utils/trailingData.ts", () => ({
  extractTrailingData: vi.fn(),
}));

const mockedReadExifMetadata = vi.mocked(readExifMetadata);
const mockedExtractTrailingData = vi.mocked(extractTrailingData);

interface BitmapLike {
  width: number;
  height: number;
  close: () => void;
}

function installCanvas(
  width: number,
  height: number,
): {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
} {
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }));
  const context = {
    drawImage,
    getImageData,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;

  vi.stubGlobal("document", {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        throw new Error("Unexpected tag");
      }
      return canvas;
    }),
  } as unknown as Document);

  return { drawImage, getImageData };
}

function installImageClass(
  width: number,
  height: number,
  shouldError = false,
): void {
  class MockImage {
    public onload: null | (() => void) = null;
    public onerror: null | (() => void) = null;
    public naturalWidth = width;
    public naturalHeight = height;

    set src(_: string) {
      queueMicrotask(() => {
        if (shouldError) {
          this.onerror?.();
        } else {
          this.onload?.();
        }
      });
    }
  }

  vi.stubGlobal("Image", MockImage);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockedReadExifMetadata.mockResolvedValue(null);
  mockedExtractTrailingData.mockReturnValue(null);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn(),
  });
});

test("decodeImageFile decodes with createImageBitmap when available", async () => {
  const { drawImage } = installCanvas(2, 1);
  const close = vi.fn();
  const bitmap: BitmapLike = { width: 2, height: 1, close };
  const createImageBitmapMock = vi.fn(async () => bitmap);
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  mockedReadExifMetadata.mockResolvedValueOnce({
    source: "exifr",
    entries: [{ group: "ifd0", tagId: 0, tagName: "Make", value: "Canon" }],
  });
  mockedExtractTrailingData.mockReturnValueOnce({
    containerEndOffset: 4,
    byteLength: 1,
    bytes: new Uint8Array([0xaa]),
  });
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "sample.png", {
    type: "image/png",
  });

  const decoded = await decodeImageFile(file);

  expect(decoded.format).toBe("image/png");
  expect(decoded.width).toBe(2);
  expect(decoded.height).toBe(1);
  expect(decoded.byteSize).toBe(5);
  expect(decoded.exif?.entries[0]?.value).toBe("Canon");
  expect(decoded.trailingData?.byteLength).toBe(1);
  expect(drawImage).toHaveBeenCalledTimes(1);
  expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test("decodeImageFile falls back to image element when createImageBitmap fails", async () => {
  installCanvas(3, 2);
  const createImageBitmapMock = vi.fn(async () => {
    throw new Error("bitmap failed");
  });
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  installImageClass(3, 2);
  mockedReadExifMetadata.mockRejectedValueOnce(new Error("exif failure"));
  mockedExtractTrailingData.mockImplementationOnce(() => {
    throw new Error("trailing failure");
  });
  const file = new File([new Uint8Array([1, 2, 3])], "sample.jpg", {
    type: "image/jpg",
  });

  const decoded = await decodeImageFile(file);

  expect(decoded.format).toBe("image/jpeg");
  expect(decoded.width).toBe(3);
  expect(decoded.height).toBe(2);
  expect(decoded.exif).toBeNull();
  expect(decoded.trailingData).toBeNull();
  expect(
    globalThis.URL.revokeObjectURL as ReturnType<typeof vi.fn>,
  ).toHaveBeenCalledWith("blob:test");
});

test("decodeImageFile accepts extension-based format when MIME type is empty", async () => {
  installCanvas(1, 1);
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1, height: 1, close })),
  );
  const file = new File([new Uint8Array([1])], "photo.jpeg", { type: "" });

  const decoded = await decodeImageFile(file);

  expect(decoded.format).toBe("image/jpeg");
});

test("decodeImageFile throws for unsupported file type", async () => {
  const file = new File([new Uint8Array([1])], "note.txt", {
    type: "text/plain",
  });
  await expect(decodeImageFile(file)).rejects.toThrow("Unsupported file type");
});

test("decodeImageFile propagates image-size validation errors", async () => {
  installCanvas(5_000, 5_000);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 5_000, height: 5_000, close: vi.fn() })),
  );
  installImageClass(5_000, 5_000);
  const file = new File([new Uint8Array([1, 2])], "too-big.png", {
    type: "image/png",
  });

  await expect(decodeImageFile(file)).rejects.toThrow("Image is too large");
});

test("decodeImageFile throws when image element cannot load", async () => {
  installCanvas(1, 1);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      throw new Error("bitmap failed");
    }),
  );
  installImageClass(1, 1, true);
  const file = new File([new Uint8Array([1])], "bad.png", {
    type: "image/png",
  });

  await expect(decodeImageFile(file)).rejects.toThrow(
    "Unable to read image data.",
  );
});
