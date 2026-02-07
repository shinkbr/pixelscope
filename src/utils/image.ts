import type { DecodedImage } from "../types";

const MAX_PIXELS = 24_000_000;

function normalizeImageFormat(file: File): DecodedImage["format"] | null {
  const mimeType = file.type.toLowerCase();

  if (mimeType === "image/png") {
    return "image/png";
  }

  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/pjpeg") {
    return "image/jpeg";
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) {
    return "image/png";
  }

  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
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

function readFromCanvas(drawFn: (ctx: CanvasRenderingContext2D) => void, width: number, height: number): ImageData {
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
    return readFromCanvas((ctx) => {
      ctx.drawImage(bitmap, 0, 0);
    }, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function decodeWithImageElement(file: File): Promise<ImageData> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(objectUrl);
    return readFromCanvas((ctx) => {
      ctx.drawImage(image, 0, 0);
    }, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const format = normalizeImageFormat(file);
  if (!format) {
    throw new Error("Unsupported file type. Please upload a PNG or JPEG image.");
  }

  let imageData: ImageData;

  try {
    imageData = await decodeWithImageBitmap(file);
  } catch {
    imageData = await decodeWithImageElement(file);
  }

  return {
    filename: file.name,
    format,
    byteSize: file.size,
    width: imageData.width,
    height: imageData.height,
    imageData,
  };
}
