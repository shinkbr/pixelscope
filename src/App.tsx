import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type {
  BitExtractionOptions,
  DecodedImage,
  ExifGroup,
  ExifLocation,
  ExtractionBitOrder,
  ExtractionBytePackOrder,
  ExtractionChannelOrder,
  ExtractionScanOrder,
  PlaneSpec,
} from "./types";
import {
  buildPlaneSpecs,
  extractBitPlane,
  extractBitPlaneStream,
  extractCombinedBitPlanes,
} from "./utils/bitPlane";
import { formatBytes } from "./utils/format";
import { buildHexDump } from "./utils/hexDump";
import { decodeImageFile } from "./utils/image";
import {
  detectCarvedPayloads,
  type CarvedPayload,
} from "./utils/payloadCarving";

const PLANE_SPECS = buildPlaneSpecs();
const CHANNEL_ROWS: PlaneSpec["channelLabel"][] = [
  "Red",
  "Green",
  "Blue",
  "Alpha",
];
const HEX_DUMP_MAX_BYTES = 8192;
const PAYLOAD_SCAN_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_EXTRACTION_OPTIONS: BitExtractionOptions = {
  scanOrder: "row-major",
  channelOrder: "rgba",
  bitOrder: "lsb-to-msb",
  bytePackOrder: "msb-first",
};

const SCAN_ORDER_OPTIONS: Array<{ value: ExtractionScanOrder; label: string }> =
  [
    { value: "row-major", label: "Horizontal (row-major)" },
    { value: "column-major", label: "Vertical (column-major)" },
  ];

const CHANNEL_ORDER_OPTIONS: Array<{
  value: ExtractionChannelOrder;
  label: string;
}> = [
  { value: "rgba", label: "RGBA" },
  { value: "bgra", label: "BGRA" },
  { value: "argb", label: "ARGB" },
  { value: "abgr", label: "ABGR" },
];

const BIT_ORDER_OPTIONS: Array<{ value: ExtractionBitOrder; label: string }> = [
  { value: "lsb-to-msb", label: "LSB -> MSB (1..8)" },
  { value: "msb-to-lsb", label: "MSB -> LSB (8..1)" },
];

const BYTE_PACK_OPTIONS: Array<{
  value: ExtractionBytePackOrder;
  label: string;
}> = [
  { value: "msb-first", label: "Byte MSB first" },
  { value: "lsb-first", label: "Byte LSB first" },
];

type AnalyzerTab = "view" | "bit-planes" | "exif" | "trailing-data";
type ViewMode =
  | "original"
  | "xor"
  | "high-contrast"
  | "grayscale"
  | "red-channel"
  | "green-channel"
  | "blue-channel";

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: "original", label: "Original" },
  { value: "xor", label: "XOR (invert all bits)" },
  { value: "high-contrast", label: "High contrast" },
  { value: "grayscale", label: "Grayscale" },
  { value: "red-channel", label: "Red channel focus" },
  { value: "green-channel", label: "Green channel focus" },
  { value: "blue-channel", label: "Blue channel focus" },
];

const ANALYZER_TABS: Array<{ id: AnalyzerTab; label: string }> = [
  { id: "view", label: "View" },
  { id: "exif", label: "Exif" },
  { id: "bit-planes", label: "Bit-Plane" },
  { id: "trailing-data", label: "Trailing data" },
];

const EXIF_GROUP_ORDER: ExifGroup[] = [
  "ifd0",
  "exif",
  "gps",
  "interop",
  "ifd1",
];
const EXIF_GROUP_LABELS: Record<ExifGroup, string> = {
  ifd0: "Image (IFD0)",
  exif: "Exif SubIFD",
  gps: "GPS",
  interop: "Interop",
  ifd1: "Thumbnail (IFD1)",
};

function getExifSourceLabel(
  source: NonNullable<DecodedImage["exif"]>["source"],
): string {
  if (source === "exifr") {
    return "exifr";
  }
  return source;
}

function buildGoogleMapsEmbedUrl(location: ExifLocation): string {
  const coordinates = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(coordinates)}&z=15&output=embed`;
}

function buildExtractionDownloadName(
  sourceFileName: string,
  selectedPlanes: PlaneSpec[],
  options: BitExtractionOptions,
): string {
  const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "image";
  const selectionPart =
    selectedPlanes.length === 1
      ? selectedPlanes[0].id
      : `${selectedPlanes.length}planes`;

  return `${baseName}_${selectionPart}_${options.scanOrder}_${options.channelOrder}_${options.bitOrder}_${options.bytePackOrder}.bin`;
}

function buildTrailingDataDownloadName(sourceFileName: string): string {
  const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}_trailing.bin`;
}

function formatHexOffset(offset: number): string {
  return `0x${offset.toString(16).toUpperCase()}`;
}

function buildCarvedPayloadDownloadName(
  sourceFileName: string,
  sourceLabel: "bitstream" | "trailing",
  payload: CarvedPayload,
  absoluteStartOffset?: number,
): string {
  const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "image";
  const startOffset =
    absoluteStartOffset === undefined
      ? payload.startOffset
      : absoluteStartOffset;
  const offsetPart = startOffset.toString(16).toUpperCase().padStart(8, "0");
  return `${baseName}_${sourceLabel}_${payload.kind}_${offsetPart}.${payload.extension}`;
}

function transformViewImageData(
  imageData: ImageData,
  mode: ViewMode,
): ImageData {
  if (mode === "original") {
    return new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height,
    );
  }

  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);

  for (let index = 0; index < source.length; index += 4) {
    const red = source[index];
    const green = source[index + 1];
    const blue = source[index + 2];
    const alpha = source[index + 3];

    if (mode === "xor") {
      output[index] = 255 - red;
      output[index + 1] = 255 - green;
      output[index + 2] = 255 - blue;
      output[index + 3] = alpha;
      continue;
    }

    if (mode === "high-contrast") {
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const value = luminance >= 128 ? 255 : 0;
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = alpha;
      continue;
    }

    if (mode === "grayscale") {
      const value = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = alpha;
      continue;
    }

    if (mode === "red-channel") {
      output[index] = red;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = alpha;
      continue;
    }

    if (mode === "green-channel") {
      output[index] = 0;
      output[index + 1] = green;
      output[index + 2] = 0;
      output[index + 3] = alpha;
      continue;
    }

    output[index] = 0;
    output[index + 1] = 0;
    output[index + 2] = blue;
    output[index + 3] = alpha;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function App() {
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([
    PLANE_SPECS[0].id,
  ]);
  const [activePlaneId, setActivePlaneId] = useState<string>(PLANE_SPECS[0].id);
  const [extractionOptions, setExtractionOptions] =
    useState<BitExtractionOptions>(DEFAULT_EXTRACTION_OPTIONS);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>("view");
  const [skipLeadingNullBytes, setSkipLeadingNullBytes] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("original");

  const planeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const planeStripRef = useRef<HTMLDivElement | null>(null);

  const selectedPlaneSet = useMemo(
    () => new Set(selectedPlaneIds),
    [selectedPlaneIds],
  );
  const selectedPlanes = useMemo(
    () => PLANE_SPECS.filter((plane) => selectedPlaneSet.has(plane.id)),
    [selectedPlaneSet],
  );

  const activePlane = useMemo(
    () =>
      PLANE_SPECS.find((plane) => plane.id === activePlaneId) ?? PLANE_SPECS[0],
    [activePlaneId],
  );

  const activePlaneIndex = useMemo(
    () => PLANE_SPECS.findIndex((plane) => plane.id === activePlane.id),
    [activePlane.id],
  );

  const totalFrames = decoded?.frames.length ?? 0;
  const clampedFrameIndex =
    totalFrames > 0 ? Math.min(activeFrameIndex, totalFrames - 1) : 0;
  const activeFrame = decoded?.frames[clampedFrameIndex] ?? null;
  const analysisImageData =
    activeFrame?.imageData ?? decoded?.imageData ?? null;
  const activeFrameDurationMs = activeFrame?.durationMs ?? null;

  const selectionLabel = useMemo(() => {
    if (selectedPlanes.length === 0) {
      return "No selection";
    }
    if (selectedPlanes.length === 1) {
      return selectedPlanes[0].label;
    }
    return `${selectedPlanes.length} planes combined`;
  }, [selectedPlanes]);

  const hexDumpView = useMemo(() => {
    if (!analysisImageData || selectedPlanes.length === 0) {
      return null;
    }

    const extracted = extractBitPlaneStream(
      analysisImageData,
      selectedPlanes,
      extractionOptions,
      HEX_DUMP_MAX_BYTES,
    );
    const hexDump = buildHexDump(
      extracted.bytes,
      extracted.totalBytes,
      extracted.totalBits,
    );
    return {
      ...hexDump,
      bitsPerPixel: extracted.bitsPerPixel,
    };
  }, [analysisImageData, extractionOptions, selectedPlanes]);

  const bitPlanePayloadCarving = useMemo(() => {
    if (!analysisImageData || selectedPlanes.length === 0) {
      return null;
    }

    const extracted = extractBitPlaneStream(
      analysisImageData,
      selectedPlanes,
      extractionOptions,
      PAYLOAD_SCAN_MAX_BYTES,
    );
    return {
      bytes: extracted.bytes,
      payloads: detectCarvedPayloads(extracted.bytes),
      scannedBytes: extracted.bytes.length,
      totalBytes: extracted.totalBytes,
      isScanTruncated: extracted.bytes.length < extracted.totalBytes,
    };
  }, [analysisImageData, extractionOptions, selectedPlanes]);

  const exifGroups = useMemo(() => {
    if (!decoded?.exif?.entries.length) {
      return [];
    }

    return EXIF_GROUP_ORDER.map((group) => ({
      group,
      entries:
        decoded.exif?.entries.filter((entry) => entry.group === group) ?? [],
    })).filter((group) => group.entries.length > 0);
  }, [decoded]);

  const exifLocation = decoded?.exif?.location ?? null;

  const exifMapEmbedUrl = useMemo(() => {
    if (!exifLocation) {
      return null;
    }

    return buildGoogleMapsEmbedUrl(exifLocation);
  }, [exifLocation]);

  const trailingDataView = useMemo(() => {
    if (!decoded?.trailingData) {
      return null;
    }

    let skippedLeadingNullBytes = 0;
    if (skipLeadingNullBytes) {
      while (
        skippedLeadingNullBytes < decoded.trailingData.bytes.length &&
        decoded.trailingData.bytes[skippedLeadingNullBytes] === 0x00
      ) {
        skippedLeadingNullBytes += 1;
      }
    }

    const bytes = decoded.trailingData.bytes.slice(skippedLeadingNullBytes);
    return {
      bytes,
      byteLength: bytes.length,
      startOffset:
        decoded.trailingData.containerEndOffset + skippedLeadingNullBytes,
      skippedLeadingNullBytes,
    };
  }, [decoded, skipLeadingNullBytes]);

  const trailingDataHexDump = useMemo(() => {
    if (!trailingDataView) {
      return null;
    }

    return buildHexDump(
      trailingDataView.bytes.slice(0, HEX_DUMP_MAX_BYTES),
      trailingDataView.byteLength,
      trailingDataView.byteLength * 8,
    );
  }, [trailingDataView]);

  const trailingPayloadCarving = useMemo(() => {
    if (!trailingDataView) {
      return null;
    }

    const scannedBytes = trailingDataView.bytes.slice(
      0,
      PAYLOAD_SCAN_MAX_BYTES,
    );
    return {
      bytes: scannedBytes,
      payloads: detectCarvedPayloads(scannedBytes),
      scannedBytes: scannedBytes.length,
      totalBytes: trailingDataView.byteLength,
      startOffset: trailingDataView.startOffset,
      isScanTruncated: scannedBytes.length < trailingDataView.byteLength,
    };
  }, [trailingDataView]);

  const resetState = useCallback(() => {
    setDecoded(null);
    setActiveFrameIndex(0);
    setSelectedPlaneIds([PLANE_SPECS[0].id]);
    setActivePlaneId(PLANE_SPECS[0].id);
    setActiveTab("view");
    setViewMode("original");
    setError(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await decodeImageFile(file);
      setDecoded(result);
      setActiveFrameIndex(0);
      setSelectedPlaneIds([PLANE_SPECS[0].id]);
      setActivePlaneId(PLANE_SPECS[0].id);
      setActiveTab("view");
      setViewMode("original");
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to process this image.";
      setError(message);
      setDecoded(null);
      setActiveFrameIndex(0);
      setSelectedPlaneIds([PLANE_SPECS[0].id]);
      setActivePlaneId(PLANE_SPECS[0].id);
      setActiveTab("view");
      setViewMode("original");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (file) {
        await handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        await handleFile(file);
      }
    },
    [handleFile],
  );

  const togglePlaneSelection = useCallback((planeId: string) => {
    setActivePlaneId(planeId);
    setSelectedPlaneIds((currentSelection) => {
      if (currentSelection.includes(planeId)) {
        return currentSelection.filter((id) => id !== planeId);
      }
      return [...currentSelection, planeId];
    });
  }, []);

  const movePlane = useCallback(
    (step: 1 | -1) => {
      if (activePlaneIndex < 0) {
        return;
      }

      const nextIndex =
        (activePlaneIndex + step + PLANE_SPECS.length) % PLANE_SPECS.length;
      const nextPlaneId = PLANE_SPECS[nextIndex].id;
      setActivePlaneId(nextPlaneId);
      setSelectedPlaneIds([nextPlaneId]);
    },
    [activePlaneIndex],
  );

  const resetPlaneSelection = useCallback(() => {
    setActivePlaneId(PLANE_SPECS[0].id);
    setSelectedPlaneIds([PLANE_SPECS[0].id]);
  }, []);

  const downloadHexDumpData = useCallback(() => {
    if (!decoded || !analysisImageData || selectedPlanes.length === 0) {
      return;
    }

    const extracted = extractBitPlaneStream(
      analysisImageData,
      selectedPlanes,
      extractionOptions,
      Number.MAX_SAFE_INTEGER,
    );
    const payload = new Uint8Array(extracted.bytes.byteLength);
    payload.set(extracted.bytes);
    const blob = new Blob([payload], { type: "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildExtractionDownloadName(
        decoded.filename,
        selectedPlanes,
        extractionOptions,
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, [analysisImageData, decoded, extractionOptions, selectedPlanes]);

  const downloadTrailingData = useCallback(() => {
    if (!decoded || !trailingDataView || trailingDataView.byteLength === 0) {
      return;
    }

    const payload = new Uint8Array(trailingDataView.bytes.byteLength);
    payload.set(trailingDataView.bytes);
    const blob = new Blob([payload], { type: "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildTrailingDataDownloadName(decoded.filename);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, [decoded, trailingDataView]);

  const downloadBitPlaneCarvedPayload = useCallback(
    (payload: CarvedPayload) => {
      if (!decoded || !bitPlanePayloadCarving) {
        return;
      }

      const carvedBytes = bitPlanePayloadCarving.bytes.slice(
        payload.startOffset,
        payload.endOffset,
      );
      if (carvedBytes.length === 0) {
        return;
      }

      const blob = new Blob([carvedBytes], { type: payload.mimeType });
      const objectUrl = URL.createObjectURL(blob);

      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildCarvedPayloadDownloadName(
          decoded.filename,
          "bitstream",
          payload,
        );
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [bitPlanePayloadCarving, decoded],
  );

  const downloadTrailingCarvedPayload = useCallback(
    (payload: CarvedPayload) => {
      if (!decoded || !trailingPayloadCarving) {
        return;
      }

      const carvedBytes = trailingPayloadCarving.bytes.slice(
        payload.startOffset,
        payload.endOffset,
      );
      if (carvedBytes.length === 0) {
        return;
      }

      const blob = new Blob([carvedBytes], { type: payload.mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const absoluteStartOffset =
        trailingPayloadCarving.startOffset + payload.startOffset;

      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = buildCarvedPayloadDownloadName(
          decoded.filename,
          "trailing",
          payload,
          absoluteStartOffset,
        );
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [decoded, trailingPayloadCarving],
  );

  const cycleViewMode = useCallback((step: 1 | -1) => {
    setViewMode((current) => {
      const currentIndex = VIEW_MODE_OPTIONS.findIndex(
        (option) => option.value === current,
      );
      if (currentIndex < 0) {
        return VIEW_MODE_OPTIONS[0].value;
      }
      const nextIndex =
        (currentIndex + step + VIEW_MODE_OPTIONS.length) %
        VIEW_MODE_OPTIONS.length;
      return VIEW_MODE_OPTIONS[nextIndex].value;
    });
  }, []);

  const moveFrame = useCallback(
    (step: 1 | -1) => {
      if (!decoded || decoded.frames.length <= 1) {
        return;
      }

      setActiveFrameIndex((current) => {
        const frameCount = decoded.frames.length;
        const normalized = (current + step + frameCount * 4) % frameCount;
        return normalized;
      });
    },
    [decoded],
  );

  useEffect(() => {
    if (!viewCanvasRef.current) {
      return;
    }

    const canvas = viewCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!analysisImageData) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const transformedImageData = transformViewImageData(
      analysisImageData,
      viewMode,
    );
    canvas.width = transformedImageData.width;
    canvas.height = transformedImageData.height;
    context.putImageData(transformedImageData, 0, 0);
  }, [activeTab, analysisImageData, viewMode]);

  useEffect(() => {
    if (!planeCanvasRef.current) {
      return;
    }

    const canvas = planeCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!analysisImageData || selectedPlanes.length === 0) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const planeImageData =
      selectedPlanes.length === 1
        ? extractBitPlane(analysisImageData, selectedPlanes[0])
        : extractCombinedBitPlanes(analysisImageData, selectedPlanes);

    canvas.width = planeImageData.width;
    canvas.height = planeImageData.height;
    context.putImageData(planeImageData, 0, 0);
  }, [activeTab, analysisImageData, selectedPlanes]);

  useEffect(() => {
    if (!planeStripRef.current) {
      return;
    }

    const activeButton = planeStripRef.current.querySelector<HTMLButtonElement>(
      `button[data-plane-id="${activePlaneId}"]`,
    );
    activeButton?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [activePlaneId]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-clay/80 bg-transparent py-2">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold leading-tight text-ink md:text-xl">
                PixelScope
              </h1>
              <span className="text-sm text-ink/70 md:text-base">
                Steganography Toolkit
              </span>
            </div>
            <a
              href="https://github.com/shinkbr/pixelscope"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View PixelScope repository on GitHub"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-clay bg-white/80 text-ink transition hover:border-accent hover:text-accent"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="currentColor"
              >
                <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.1c-3.34.73-4.04-1.42-4.04-1.42-.55-1.37-1.34-1.73-1.34-1.73-1.1-.74.08-.73.08-.73 1.2.09 1.83 1.2 1.83 1.2 1.08 1.8 2.82 1.28 3.5.98.1-.76.43-1.28.78-1.58-2.67-.3-5.48-1.3-5.48-5.9 0-1.3.47-2.37 1.24-3.2-.13-.3-.54-1.52.12-3.16 0 0 1.02-.32 3.34 1.22a11.9 11.9 0 0 1 6.08 0c2.33-1.54 3.34-1.22 3.34-1.22.66 1.64.25 2.86.12 3.16.77.83 1.24 1.9 1.24 3.2 0 4.61-2.81 5.59-5.49 5.88.44.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
        <section className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
          <label
            className={`group relative flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white/90 p-6 text-center shadow-panel transition ${
              isDragging
                ? "border-accent bg-accentSoft/40"
                : "border-clay hover:border-accent/70"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif"
              className="sr-only"
              onChange={handleInput}
              aria-label="Upload supported image file"
            />

            <span className="rounded-full bg-accentSoft px-4 py-1 font-mono text-xs uppercase tracking-[0.16em] text-accent">
              Upload
            </span>
            <p className="mt-4 text-lg font-semibold text-ink">
              Drop image here or click to browse
            </p>
            <p className="mt-2 text-sm text-ink/70">
              Supported formats: PNG, JPEG, WebP, BMP, TIFF, GIF
            </p>
            {isLoading ? (
              <p className="mt-4 font-mono text-sm text-accent">
                Processing image...
              </p>
            ) : null}
          </label>

          <div className="rounded-2xl border border-clay bg-white/90 p-5 shadow-panel">
            <h2 className="text-base font-semibold text-ink">Image Details</h2>
            {decoded ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt className="text-ink/70">Name</dt>
                <dd className="truncate text-right font-medium text-ink">
                  {decoded.filename}
                </dd>

                <dt className="text-ink/70">Format</dt>
                <dd className="text-right font-mono text-xs uppercase tracking-wide text-ink">
                  {decoded.format}
                </dd>

                <dt className="text-ink/70">Size</dt>
                <dd className="text-right font-medium text-ink">
                  {formatBytes(decoded.byteSize)}
                </dd>

                <dt className="text-ink/70">Dimensions</dt>
                <dd className="text-right font-medium text-ink">
                  {(analysisImageData?.width ?? decoded.width).toLocaleString()}{" "}
                  x{" "}
                  {(
                    analysisImageData?.height ?? decoded.height
                  ).toLocaleString()}
                </dd>

                <dt className="text-ink/70">Total planes</dt>
                <dd className="text-right font-medium text-ink">
                  {PLANE_SPECS.length}
                </dd>

                <dt className="text-ink/70">Frames</dt>
                <dd className="text-right font-medium text-ink">
                  {totalFrames.toLocaleString()}
                </dd>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-ink/70">No image loaded.</p>
            )}

            {decoded && totalFrames > 1 ? (
              <div className="mt-4 rounded-xl border border-clay bg-paper/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink/70">
                    Frame {clampedFrameIndex + 1} of {totalFrames}
                  </p>
                  <p className="text-xs text-ink/60">
                    {activeFrameDurationMs === null
                      ? "Delay: unknown"
                      : `Delay: ${activeFrameDurationMs} ms`}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-clay px-2 py-1 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                    onClick={() => moveFrame(-1)}
                  >
                    Prev frame
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-clay px-2 py-1 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                    onClick={() => moveFrame(1)}
                  >
                    Next frame
                  </button>
                  <label className="ml-auto flex items-center gap-2 text-xs text-ink/70">
                    <span>Jump</span>
                    <select
                      value={clampedFrameIndex}
                      onChange={(event) =>
                        setActiveFrameIndex(Number(event.target.value))
                      }
                      className="rounded-md border border-clay bg-white px-2 py-1 text-xs text-ink"
                    >
                      {decoded.frames.map((_, frameIndex) => (
                        <option key={frameIndex} value={frameIndex}>
                          Frame {frameIndex + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            {decoded?.format === "image/gif" && totalFrames === 1 ? (
              <p className="mt-3 text-xs text-ink/65">
                GIF frame-level decoding is unavailable in this browser, so
                analysis uses the first frame.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={resetState}
                disabled={!decoded && !error}
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-clay bg-white/95 shadow-panel">
          <div
            className="flex flex-wrap gap-1 border-b border-clay/80 px-4 pb-0 pt-3"
            role="tablist"
            aria-label="Analyzer sections"
          >
            {ANALYZER_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-selected={isActive}
                  role="tab"
                  className={`-mb-px rounded-t-xl border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-clay border-b-white bg-white text-ink"
                      : "border-transparent bg-clay/35 text-ink/75 hover:border-clay/70 hover:bg-white/80 hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 md:p-5">
            {activeTab === "view" ? (
              <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">View</h2>
                    <p className="text-xs text-ink/70">
                      Switch between visual modes to surface hidden patterns in
                      the image.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-ink/65">
                    <span>Mode</span>
                    <select
                      value={viewMode}
                      onChange={(event) =>
                        setViewMode(event.target.value as ViewMode)
                      }
                      disabled={!decoded}
                      className="rounded-md border border-clay bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-ink disabled:opacity-50"
                    >
                      {VIEW_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => cycleViewMode(-1)}
                      disabled={!decoded}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => cycleViewMode(1)}
                      disabled={!decoded}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                  {decoded ? (
                    <canvas
                      ref={viewCanvasRef}
                      className="pixelated block h-auto w-full max-w-full rounded-md bg-black/5"
                      aria-label={`Image view mode: ${VIEW_MODE_OPTIONS.find((option) => option.value === viewMode)?.label ?? "Original"}`}
                    />
                  ) : (
                    <div className="grid h-48 place-items-center text-sm text-ink/60">
                      Upload an image to inspect view modes.
                    </div>
                  )}
                </div>
              </section>
            ) : activeTab === "bit-planes" ? (
              <div className="space-y-5">
                <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-ink">
                        Bit-Plane Navigator
                      </h2>
                      <p className="text-xs text-ink/70">
                        One row per color channel. Click any bit buttons to
                        toggle multi-selection and combine planes.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => movePlane(-1)}
                        disabled={!decoded}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => movePlane(1)}
                        disabled={!decoded}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-clay px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={resetPlaneSelection}
                        disabled={!decoded}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div ref={planeStripRef} className="space-y-3">
                    {CHANNEL_ROWS.map((channelLabel) => {
                      return (
                        <div
                          key={channelLabel}
                          className="grid gap-2 md:grid-cols-[5.75rem_1fr] md:items-center"
                        >
                          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/65">
                            {channelLabel}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {PLANE_SPECS.filter(
                              (plane) => plane.channelLabel === channelLabel,
                            ).map((plane) => {
                              const isSelected = selectedPlaneSet.has(plane.id);
                              const isActive = plane.id === activePlaneId;

                              return (
                                <button
                                  key={plane.id}
                                  type="button"
                                  data-plane-id={plane.id}
                                  title={plane.label}
                                  onClick={() => togglePlaneSelection(plane.id)}
                                  disabled={!decoded}
                                  className={`min-w-10 rounded-full border px-3 py-2 text-xs font-medium transition ${
                                    isSelected
                                      ? "border-accent bg-accent text-white"
                                      : "border-clay text-ink hover:border-accent hover:text-accent"
                                  } ${isActive ? "ring-2 ring-accent/25 ring-offset-1" : ""} disabled:cursor-not-allowed disabled:opacity-45`}
                                >
                                  {plane.bitPosition}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="grid gap-5 pb-2 lg:grid-cols-2">
                  <article className="rounded-2xl border border-clay bg-white/95 p-4 shadow-panel">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-ink">
                        Selected Plane
                      </h3>
                      <span className="rounded-full bg-accentSoft px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent">
                        {selectionLabel}
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-ink/70">
                      {selectedPlanes.length === 0
                        ? "No bit-planes selected."
                        : selectedPlanes.length === 1
                          ? selectedPlanes[0].bitPosition === 1
                            ? "Least-significant bit plane."
                            : selectedPlanes[0].bitPosition === 8
                              ? "Most-significant bit plane."
                              : "Intermediate bit plane."
                          : "Combined view uses logical OR across selected planes."}
                    </p>
                    {selectedPlanes.length > 1 ? (
                      <p className="mb-3 text-xs text-ink/60">
                        {selectedPlanes.map((plane) => plane.label).join(", ")}
                      </p>
                    ) : (
                      <p className="mb-3 text-xs text-ink/60">
                        Preview is rendered at native pixel resolution (no CSS
                        downsampling).
                      </p>
                    )}
                    <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                      {decoded ? (
                        <canvas
                          ref={planeCanvasRef}
                          className="pixelated block h-auto w-full max-w-full rounded-md bg-black/5"
                          aria-label={
                            selectedPlanes.length > 1
                              ? "Visualized combined bit planes"
                              : selectedPlanes.length === 1
                                ? `Visualized ${selectedPlanes[0].label} bit plane`
                                : "No bit plane selected"
                          }
                        />
                      ) : (
                        <div className="grid h-40 place-items-center text-sm text-ink/60">
                          Upload an image to render bit-planes.
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="rounded-2xl border border-clay bg-white/95 p-4 shadow-panel">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-ink">
                        Hex Dump
                      </h3>
                      <button
                        type="button"
                        onClick={downloadHexDumpData}
                        disabled={!decoded || selectedPlanes.length === 0}
                        className="rounded-lg border border-clay px-3 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Download
                      </button>
                    </div>
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink/65">
                        <span>Scan Order</span>
                        <select
                          value={extractionOptions.scanOrder}
                          onChange={(event) =>
                            setExtractionOptions((current) => ({
                              ...current,
                              scanOrder: event.target
                                .value as ExtractionScanOrder,
                            }))
                          }
                          disabled={!decoded}
                          className="rounded-md border border-clay bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-ink disabled:opacity-50"
                        >
                          {SCAN_ORDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink/65">
                        <span>Channel Order</span>
                        <select
                          value={extractionOptions.channelOrder}
                          onChange={(event) =>
                            setExtractionOptions((current) => ({
                              ...current,
                              channelOrder: event.target
                                .value as ExtractionChannelOrder,
                            }))
                          }
                          disabled={!decoded}
                          className="rounded-md border border-clay bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-ink disabled:opacity-50"
                        >
                          {CHANNEL_ORDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink/65">
                        <span>Bit Order</span>
                        <select
                          value={extractionOptions.bitOrder}
                          onChange={(event) =>
                            setExtractionOptions((current) => ({
                              ...current,
                              bitOrder: event.target
                                .value as ExtractionBitOrder,
                            }))
                          }
                          disabled={!decoded}
                          className="rounded-md border border-clay bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-ink disabled:opacity-50"
                        >
                          {BIT_ORDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink/65">
                        <span>Byte Packing</span>
                        <select
                          value={extractionOptions.bytePackOrder}
                          onChange={(event) =>
                            setExtractionOptions((current) => ({
                              ...current,
                              bytePackOrder: event.target
                                .value as ExtractionBytePackOrder,
                            }))
                          }
                          disabled={!decoded}
                          className="rounded-md border border-clay bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-ink disabled:opacity-50"
                        >
                          {BYTE_PACK_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {hexDumpView ? (
                      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-ink/70">
                        <p>
                          Total bits: {hexDumpView.totalBits.toLocaleString()}
                        </p>
                        <p className="text-right">
                          Total bytes: {hexDumpView.totalBytes.toLocaleString()}
                        </p>
                        <p>
                          Bits per pixel:{" "}
                          {hexDumpView.bitsPerPixel.toLocaleString()}
                        </p>
                        <p className="text-right">
                          {hexDumpView.isTruncated
                            ? "Truncated preview"
                            : "Full dump"}
                        </p>
                        <p>
                          Shown bytes: {hexDumpView.shownBytes.toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                    <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                      {hexDumpView && hexDumpView.shownBytes > 0 ? (
                        <pre className="font-mono text-[11px] leading-relaxed text-ink/90">
                          {hexDumpView.text}
                        </pre>
                      ) : decoded ? (
                        <div className="grid h-40 place-items-center text-sm text-ink/60">
                          No bit plane selected. Select one or more planes to
                          view the hex dump.
                        </div>
                      ) : (
                        <div className="grid h-40 place-items-center text-sm text-ink/60">
                          Upload an image to inspect hex data.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-clay bg-paper/35 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-ink">
                          Payload Carving
                        </h4>
                        <span className="rounded-full bg-accentSoft px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
                          {bitPlanePayloadCarving
                            ? `${bitPlanePayloadCarving.payloads.length} match${bitPlanePayloadCarving.payloads.length === 1 ? "" : "es"}`
                            : "0 matches"}
                        </span>
                      </div>

                      {bitPlanePayloadCarving &&
                      bitPlanePayloadCarving.isScanTruncated ? (
                        <p className="mb-2 text-xs text-ink/65">
                          Scanned first{" "}
                          {bitPlanePayloadCarving.scannedBytes.toLocaleString()}{" "}
                          bytes of{" "}
                          {bitPlanePayloadCarving.totalBytes.toLocaleString()}.
                        </p>
                      ) : null}

                      {!decoded ? (
                        <p className="text-sm text-ink/60">
                          Upload an image to carve candidate payloads.
                        </p>
                      ) : selectedPlanes.length === 0 ? (
                        <p className="text-sm text-ink/60">
                          Select one or more planes to carve detected payload
                          signatures.
                        </p>
                      ) : !bitPlanePayloadCarving ||
                        bitPlanePayloadCarving.payloads.length === 0 ? (
                        <p className="text-sm text-ink/60">
                          No known file signatures detected in the scanned
                          extracted stream.
                        </p>
                      ) : (
                        <div className="max-h-60 space-y-2 overflow-auto pr-1">
                          {bitPlanePayloadCarving.payloads.map((payload) => {
                            const endsAtScanBoundary =
                              bitPlanePayloadCarving.isScanTruncated &&
                              payload.endOffset ===
                                bitPlanePayloadCarving.scannedBytes;

                            return (
                              <article
                                key={payload.id}
                                className="rounded-lg border border-clay bg-white px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-ink">
                                      {payload.label}
                                    </p>
                                    <p className="font-mono text-[11px] text-ink/70">
                                      {payload.kind.toUpperCase()} |{" "}
                                      {formatBytes(payload.byteLength)} |{" "}
                                      {payload.startOffset.toLocaleString()} (
                                      {formatHexOffset(payload.startOffset)}) -
                                      {payload.endOffset.toLocaleString()} (
                                      {formatHexOffset(payload.endOffset)})
                                    </p>
                                    <p className="text-[11px] text-ink/60">
                                      Signature: {payload.signature} | Method:{" "}
                                      {payload.strategy}
                                    </p>
                                    <p className="text-[11px] text-ink/60">
                                      Confidence: {payload.confidence}
                                      {endsAtScanBoundary
                                        ? " (may be scan-truncated)"
                                        : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadBitPlaneCarvedPayload(payload)
                                    }
                                    className="rounded-lg border border-clay px-3 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                                  >
                                    Carve
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                </section>
              </div>
            ) : activeTab === "exif" ? (
              <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">
                    Exif Metadata
                  </h2>
                  {decoded?.exif ? (
                    <span className="rounded-full bg-accentSoft px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent">
                      {getExifSourceLabel(decoded.exif.source)}
                    </span>
                  ) : null}
                </div>

                {!decoded ? (
                  <div className="grid h-48 place-items-center rounded-xl border border-clay bg-white text-sm text-ink/60">
                    Upload an image to inspect Exif metadata.
                  </div>
                ) : !decoded.exif || decoded.exif.entries.length === 0 ? (
                  <div className="grid h-48 place-items-center rounded-xl border border-clay bg-white text-sm text-ink/60">
                    No Exif metadata found in this image.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {exifGroups.map((group) => (
                      <div key={group.group} className="space-y-4">
                        <article className="overflow-hidden rounded-xl border border-clay bg-white">
                          <header className="border-b border-clay/80 bg-paper/60 px-4 py-2">
                            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/75">
                              {EXIF_GROUP_LABELS[group.group]}
                            </h3>
                          </header>
                          <dl className="divide-y divide-clay/40">
                            {group.entries.map((entry, entryIndex) => (
                              <div
                                key={`${group.group}-${entry.tagId}-${entryIndex}`}
                                className="grid gap-1 px-4 py-2 sm:grid-cols-[16rem_1fr] sm:items-start"
                              >
                                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/65">
                                  {entry.tagName}
                                  <span className="ml-2 normal-case tracking-normal text-ink/45">
                                    0x
                                    {entry.tagId
                                      .toString(16)
                                      .toUpperCase()
                                      .padStart(4, "0")}
                                  </span>
                                </dt>
                                <dd className="break-words text-sm text-ink">
                                  {entry.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </article>
                        {group.group === "gps" &&
                        exifLocation &&
                        exifMapEmbedUrl ? (
                          <article className="overflow-hidden rounded-xl border border-clay bg-white">
                            <header className="border-b border-clay/80 bg-paper/60 px-4 py-2">
                              <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/75">
                                GPS Location
                              </h3>
                            </header>
                            <div className="space-y-3 p-4">
                              <p className="text-sm text-ink/80">
                                Latitude:{" "}
                                <span className="font-mono text-xs text-ink">
                                  {exifLocation.latitude.toFixed(6)}
                                </span>{" "}
                                | Longitude:{" "}
                                <span className="font-mono text-xs text-ink">
                                  {exifLocation.longitude.toFixed(6)}
                                </span>
                              </p>
                              <div className="overflow-hidden rounded-lg border border-clay">
                                <iframe
                                  title="EXIF GPS location map"
                                  src={exifMapEmbedUrl}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                                  className="h-72 w-full"
                                />
                              </div>
                            </div>
                          </article>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">
                    Trailing Data
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-ink/80">
                      <input
                        type="checkbox"
                        checked={skipLeadingNullBytes}
                        onChange={(event) =>
                          setSkipLeadingNullBytes(event.target.checked)
                        }
                        disabled={!decoded?.trailingData}
                        className="h-4 w-4 rounded border-clay text-accent focus:ring-accent disabled:opacity-45"
                      />
                      <span>Skip leading null bytes</span>
                    </label>
                    <button
                      type="button"
                      onClick={downloadTrailingData}
                      disabled={
                        !trailingDataView || trailingDataView.byteLength === 0
                      }
                      className="rounded-lg border border-clay px-3 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Download extracted data
                    </button>
                  </div>
                </div>

                {!decoded ? (
                  <div className="grid h-48 place-items-center rounded-xl border border-clay bg-white text-sm text-ink/60">
                    Upload an image to inspect trailing data.
                  </div>
                ) : !decoded.trailingData ? (
                  <div className="grid h-48 place-items-center rounded-xl border border-clay bg-white text-sm text-ink/60">
                    No trailing data found after the image EOF marker.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-2 rounded-xl border border-clay bg-white p-4 text-sm text-ink/75 md:grid-cols-2">
                      <p>
                        EOF offset:{" "}
                        <span className="font-mono text-xs text-ink">
                          {decoded.trailingData.containerEndOffset.toLocaleString()}{" "}
                          (0x
                          {decoded.trailingData.containerEndOffset
                            .toString(16)
                            .toUpperCase()}
                          )
                        </span>
                      </p>
                      <p className="md:text-right">
                        Trailing bytes:{" "}
                        <span className="font-medium text-ink">
                          {trailingDataView?.byteLength.toLocaleString() ?? "0"}{" "}
                          ({formatBytes(trailingDataView?.byteLength ?? 0)})
                        </span>
                      </p>
                      {skipLeadingNullBytes &&
                      trailingDataView &&
                      trailingDataView.skippedLeadingNullBytes > 0 ? (
                        <p>
                          Skipped null prefix:{" "}
                          <span className="font-medium text-ink">
                            {trailingDataView.skippedLeadingNullBytes.toLocaleString()}{" "}
                            bytes
                          </span>
                        </p>
                      ) : (
                        <p />
                      )}
                      <p>
                        File size:{" "}
                        <span className="font-medium text-ink">
                          {decoded.byteSize.toLocaleString()} bytes
                        </span>
                      </p>
                      <p className="md:text-right">
                        Range:{" "}
                        <span className="font-mono text-xs text-ink">
                          {trailingDataView && trailingDataView.byteLength > 0
                            ? `${trailingDataView.startOffset.toLocaleString()} - ${(decoded.byteSize - 1).toLocaleString()}`
                            : "None"}
                        </span>
                      </p>
                    </div>

                    {trailingDataHexDump ? (
                      <div className="grid grid-cols-2 gap-2 text-xs text-ink/70">
                        <p>
                          Total bits:{" "}
                          {trailingDataHexDump.totalBits.toLocaleString()}
                        </p>
                        <p className="text-right">
                          Total bytes:{" "}
                          {trailingDataHexDump.totalBytes.toLocaleString()}
                        </p>
                        <p className="text-right col-span-2">
                          {trailingDataHexDump.isTruncated
                            ? `Hex preview truncated to ${HEX_DUMP_MAX_BYTES.toLocaleString()} bytes`
                            : "Full trailing data shown"}
                        </p>
                      </div>
                    ) : null}

                    <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                      {trailingDataHexDump &&
                      trailingDataHexDump.shownBytes > 0 ? (
                        <pre className="font-mono text-[11px] leading-relaxed text-ink/90">
                          {trailingDataHexDump.text}
                        </pre>
                      ) : (
                        <div className="grid h-32 place-items-center text-sm text-ink/60">
                          {skipLeadingNullBytes
                            ? "No trailing bytes remain after skipping null prefix."
                            : "Trailing data is empty."}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-clay bg-paper/35 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-ink">
                          Payload Carving
                        </h4>
                        <span className="rounded-full bg-accentSoft px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-accent">
                          {trailingPayloadCarving
                            ? `${trailingPayloadCarving.payloads.length} match${trailingPayloadCarving.payloads.length === 1 ? "" : "es"}`
                            : "0 matches"}
                        </span>
                      </div>

                      {trailingPayloadCarving &&
                      trailingPayloadCarving.isScanTruncated ? (
                        <p className="mb-2 text-xs text-ink/65">
                          Scanned first{" "}
                          {trailingPayloadCarving.scannedBytes.toLocaleString()}{" "}
                          bytes of{" "}
                          {trailingPayloadCarving.totalBytes.toLocaleString()}{" "}
                          trailing bytes.
                        </p>
                      ) : null}

                      {!trailingPayloadCarving ||
                      trailingPayloadCarving.payloads.length === 0 ? (
                        <p className="text-sm text-ink/60">
                          No known file signatures detected in the scanned
                          trailing stream.
                        </p>
                      ) : (
                        <div className="max-h-60 space-y-2 overflow-auto pr-1">
                          {trailingPayloadCarving.payloads.map((payload) => {
                            const endsAtScanBoundary =
                              trailingPayloadCarving.isScanTruncated &&
                              payload.endOffset ===
                                trailingPayloadCarving.scannedBytes;
                            const absoluteStart =
                              trailingPayloadCarving.startOffset +
                              payload.startOffset;
                            const absoluteEnd =
                              trailingPayloadCarving.startOffset +
                              payload.endOffset;

                            return (
                              <article
                                key={payload.id}
                                className="rounded-lg border border-clay bg-white px-3 py-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-ink">
                                      {payload.label}
                                    </p>
                                    <p className="font-mono text-[11px] text-ink/70">
                                      {payload.kind.toUpperCase()} |{" "}
                                      {formatBytes(payload.byteLength)} | Local{" "}
                                      {payload.startOffset.toLocaleString()} (
                                      {formatHexOffset(payload.startOffset)}) -
                                      {payload.endOffset.toLocaleString()} (
                                      {formatHexOffset(payload.endOffset)})
                                    </p>
                                    <p className="font-mono text-[11px] text-ink/65">
                                      File offsets:{" "}
                                      {absoluteStart.toLocaleString()} (
                                      {formatHexOffset(absoluteStart)}) -{" "}
                                      {absoluteEnd.toLocaleString()} (
                                      {formatHexOffset(absoluteEnd)})
                                    </p>
                                    <p className="text-[11px] text-ink/60">
                                      Signature: {payload.signature} | Method:{" "}
                                      {payload.strategy}
                                    </p>
                                    <p className="text-[11px] text-ink/60">
                                      Confidence: {payload.confidence}
                                      {endsAtScanBoundary
                                        ? " (may be scan-truncated)"
                                        : ""}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadTrailingCarvedPayload(payload)
                                    }
                                    className="rounded-lg border border-clay px-3 py-2 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                                  >
                                    Carve
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
