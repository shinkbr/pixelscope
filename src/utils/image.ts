import type { DecodedImage, ImageFrame, SupportedImageFormat } from "../types";
import { readExifMetadata } from "./exif";
import { extractTrailingData } from "./trailingData";

const MAX_PIXELS = 24_000_000;

function normalizeImageFormat(file: File): SupportedImageFormat | null {
  const mimeType = file.type.toLowerCase();

  if (mimeType === "image/png") {
    return "image/png";
  }

  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/pjpeg"
  ) {
    return "image/jpeg";
  }

  if (mimeType === "image/webp") {
    return "image/webp";
  }

  if (
    mimeType === "image/bmp" ||
    mimeType === "image/x-ms-bmp" ||
    mimeType === "image/x-bmp"
  ) {
    return "image/bmp";
  }

  if (mimeType === "image/tiff" || mimeType === "image/x-tiff") {
    return "image/tiff";
  }

  if (mimeType === "image/gif") {
    return "image/gif";
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) {
    return "image/png";
  }

  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (name.endsWith(".webp")) {
    return "image/webp";
  }

  if (name.endsWith(".bmp") || name.endsWith(".dib")) {
    return "image/bmp";
  }

  if (name.endsWith(".tif") || name.endsWith(".tiff")) {
    return "image/tiff";
  }

  if (name.endsWith(".gif")) {
    return "image/gif";
  }

  return null;
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read image data."));
    image.src = url;
  });
}

function ensureImageSize(width: number, height: number): void {
  if (width * height > MAX_PIXELS) {
    throw new Error(
      `Image is too large (${width}x${height}). Please choose an image under ${MAX_PIXELS.toLocaleString()} pixels.`,
    );
  }
}

function readFromCanvas(
  drawFn: (ctx: CanvasRenderingContext2D) => void,
  width: number,
  height: number,
): ImageData {
  ensureImageSize(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D context is unavailable in this browser.");
  }

  drawFn(context);
  return context.getImageData(0, 0, width, height);
}

async function decodeWithImageBitmap(file: File): Promise<ImageData> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap is not available.");
  }

  const bitmap = await (async () => {
    try {
      // Prefer no implicit orientation/color conversion for stego analysis.
      return await createImageBitmap(file, {
        imageOrientation: "none",
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
    } catch {
      return createImageBitmap(file);
    }
  })();

  try {
    return readFromCanvas(
      (ctx) => {
        ctx.drawImage(bitmap, 0, 0);
      },
      bitmap.width,
      bitmap.height,
    );
  } finally {
    bitmap.close();
  }
}

async function decodeWithImageElement(file: File): Promise<ImageData> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(objectUrl);
    return readFromCanvas(
      (ctx) => {
        ctx.drawImage(image, 0, 0);
      },
      image.naturalWidth,
      image.naturalHeight,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type DecoderFrameLike = CanvasImageSource & {
  displayWidth?: number;
  displayHeight?: number;
  codedWidth?: number;
  codedHeight?: number;
  width?: number;
  height?: number;
  duration?: number;
  close?: () => void;
};

interface DecoderTrackLike {
  frameCount?: number;
}

interface ImageDecoderLike {
  tracks?: {
    selectedTrack?: DecoderTrackLike;
  };
  decode: (options?: { frameIndex?: number }) => Promise<{
    image: DecoderFrameLike;
  }>;
  close?: () => void;
}

type ImageDecoderConstructor = new (config: {
  data: BufferSource;
  type: string;
  preferAnimation?: boolean;
}) => ImageDecoderLike;

function getImageDecoderConstructor(): ImageDecoderConstructor | null {
  const globalValue = globalThis as unknown as {
    ImageDecoder?: ImageDecoderConstructor;
  };
  return typeof globalValue.ImageDecoder === "function"
    ? globalValue.ImageDecoder
    : null;
}

function getDecoderFrameDimensions(
  frame: DecoderFrameLike,
): { width: number; height: number } | null {
  const width =
    frame.displayWidth ??
    frame.codedWidth ??
    frame.width ??
    (frame as unknown as { naturalWidth?: number }).naturalWidth;
  const height =
    frame.displayHeight ??
    frame.codedHeight ??
    frame.height ??
    (frame as unknown as { naturalHeight?: number }).naturalHeight;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function decodeFrameDurationMs(frame: DecoderFrameLike): number | null {
  if (
    typeof frame.duration !== "number" ||
    !Number.isFinite(frame.duration) ||
    frame.duration <= 0
  ) {
    return null;
  }

  const durationMs = frame.duration / 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return Math.max(1, Math.round(durationMs));
}

async function decodeGifFrames(
  sourceBytes: Uint8Array,
): Promise<ImageFrame[] | null> {
  const Decoder = getImageDecoderConstructor();
  if (!Decoder) {
    return null;
  }

  let decoder: ImageDecoderLike | null = null;
  try {
    const decoderBuffer = new ArrayBuffer(sourceBytes.byteLength);
    new Uint8Array(decoderBuffer).set(sourceBytes);
    decoder = new Decoder({
      data: decoderBuffer,
      type: "image/gif",
      preferAnimation: true,
    });
    const frameCount = decoder.tracks?.selectedTrack?.frameCount ?? 0;
    if (frameCount <= 1) {
      return null;
    }

    const frames: ImageFrame[] = [];
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const decoded = await decoder.decode({ frameIndex });
      const frame = decoded.image;
      const dimensions = getDecoderFrameDimensions(frame);
      if (!dimensions) {
        return null;
      }

      try {
        const imageData = readFromCanvas(
          (ctx) => {
            ctx.drawImage(frame, 0, 0);
          },
          dimensions.width,
          dimensions.height,
        );
        frames.push({
          imageData,
          durationMs: decodeFrameDurationMs(frame),
        });
      } finally {
        frame.close?.();
      }
    }

    return frames.length > 0 ? frames : null;
  } catch {
    return null;
  } finally {
    decoder?.close?.();
  }
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const format = normalizeImageFormat(file);
  if (!format) {
    throw new Error(
      "Unsupported file type. Please upload a PNG, JPEG, WebP, BMP, TIFF, or GIF image.",
    );
  }

  let imageData: ImageData;
  let frames: ImageFrame[] | null = null;
  let exif: DecodedImage["exif"] = null;
  let sourceBytes: Uint8Array | null = null;

  try {
    exif = await readExifMetadata(file);
  } catch {
    exif = null;
  }

  try {
    sourceBytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    sourceBytes = null;
  }

  if (format === "image/gif" && sourceBytes) {
    frames = await decodeGifFrames(sourceBytes);
  }

  try {
    if (frames && frames.length > 0) {
      imageData = frames[0].imageData;
    } else {
      imageData = await decodeWithImageBitmap(file);
      frames = [{ imageData, durationMs: null }];
    }
  } catch {
    imageData = await decodeWithImageElement(file);
    frames = [{ imageData, durationMs: null }];
  }

  let trailingData: DecodedImage["trailingData"] = null;
  if (sourceBytes) {
    try {
      trailingData = extractTrailingData(sourceBytes, format);
    } catch {
      trailingData = null;
    }
  }

  return {
    filename: file.name,
    format,
    byteSize: file.size,
    width: imageData.width,
    height: imageData.height,
    imageData,
    frames: frames ?? [{ imageData, durationMs: null }],
    exif,
    trailingData,
  };
}
