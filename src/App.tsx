import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type {
  BitExtractionOptions,
  DecodedImage,
  ExifGroup,
  ExtractionBitOrder,
  ExtractionBytePackOrder,
  ExtractionChannelOrder,
  ExtractionScanOrder,
  PlaneSpec,
} from "./types";
import { buildPlaneSpecs, extractBitPlane, extractBitPlaneStream, extractCombinedBitPlanes } from "./utils/bitPlane";
import { formatBytes } from "./utils/format";
import { buildHexDump } from "./utils/hexDump";
import { decodeImageFile } from "./utils/image";

const PLANE_SPECS = buildPlaneSpecs();
const CHANNEL_ROWS: PlaneSpec["channelLabel"][] = ["Red", "Green", "Blue", "Alpha"];
const HEX_DUMP_MAX_BYTES = 8192;
const DEFAULT_EXTRACTION_OPTIONS: BitExtractionOptions = {
  scanOrder: "row-major",
  channelOrder: "rgba",
  bitOrder: "lsb-to-msb",
  bytePackOrder: "msb-first",
};

const SCAN_ORDER_OPTIONS: Array<{ value: ExtractionScanOrder; label: string }> = [
  { value: "row-major", label: "Horizontal (row-major)" },
  { value: "column-major", label: "Vertical (column-major)" },
];

const CHANNEL_ORDER_OPTIONS: Array<{ value: ExtractionChannelOrder; label: string }> = [
  { value: "rgba", label: "RGBA" },
  { value: "bgra", label: "BGRA" },
  { value: "argb", label: "ARGB" },
  { value: "abgr", label: "ABGR" },
];

const BIT_ORDER_OPTIONS: Array<{ value: ExtractionBitOrder; label: string }> = [
  { value: "lsb-to-msb", label: "LSB -> MSB (1..8)" },
  { value: "msb-to-lsb", label: "MSB -> LSB (8..1)" },
];

const BYTE_PACK_OPTIONS: Array<{ value: ExtractionBytePackOrder; label: string }> = [
  { value: "msb-first", label: "Byte MSB first" },
  { value: "lsb-first", label: "Byte LSB first" },
];

type AnalyzerTab = "bit-planes" | "exif";

const ANALYZER_TABS: Array<{ id: AnalyzerTab; label: string }> = [
  { id: "bit-planes", label: "Bit-Plane Navigator" },
  { id: "exif", label: "Exif" },
];

const EXIF_GROUP_ORDER: ExifGroup[] = ["ifd0", "exif", "gps", "interop", "ifd1"];
const EXIF_GROUP_LABELS: Record<ExifGroup, string> = {
  ifd0: "Image (IFD0)",
  exif: "Exif SubIFD",
  gps: "GPS",
  interop: "Interop",
  ifd1: "Thumbnail (IFD1)",
};

function getExifSourceLabel(source: NonNullable<DecodedImage["exif"]>["source"]): string {
  if (source === "exifr") {
    return "exifr";
  }
  return source;
}

function buildExtractionDownloadName(
  sourceFileName: string,
  selectedPlanes: PlaneSpec[],
  options: BitExtractionOptions,
): string {
  const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "image";
  const selectionPart = selectedPlanes.length === 1 ? selectedPlanes[0].id : `${selectedPlanes.length}planes`;

  return `${baseName}_${selectionPart}_${options.scanOrder}_${options.channelOrder}_${options.bitOrder}_${options.bytePackOrder}.bin`;
}

function App() {
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([PLANE_SPECS[0].id]);
  const [activePlaneId, setActivePlaneId] = useState<string>(PLANE_SPECS[0].id);
  const [extractionOptions, setExtractionOptions] = useState<BitExtractionOptions>(DEFAULT_EXTRACTION_OPTIONS);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>("bit-planes");

  const planeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const planeStripRef = useRef<HTMLDivElement | null>(null);

  const selectedPlaneSet = useMemo(() => new Set(selectedPlaneIds), [selectedPlaneIds]);
  const selectedPlanes = useMemo(
    () => PLANE_SPECS.filter((plane) => selectedPlaneSet.has(plane.id)),
    [selectedPlaneSet],
  );

  const activePlane = useMemo(
    () => PLANE_SPECS.find((plane) => plane.id === activePlaneId) ?? PLANE_SPECS[0],
    [activePlaneId],
  );

  const activePlaneIndex = useMemo(
    () => PLANE_SPECS.findIndex((plane) => plane.id === activePlane.id),
    [activePlane.id],
  );

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
    if (!decoded || selectedPlanes.length === 0) {
      return null;
    }

    const extracted = extractBitPlaneStream(decoded.imageData, selectedPlanes, extractionOptions, HEX_DUMP_MAX_BYTES);
    const hexDump = buildHexDump(extracted.bytes, extracted.totalBytes, extracted.totalBits);
    return {
      ...hexDump,
      bitsPerPixel: extracted.bitsPerPixel,
    };
  }, [decoded, extractionOptions, selectedPlanes]);

  const exifGroups = useMemo(() => {
    if (!decoded?.exif?.entries.length) {
      return [];
    }

    return EXIF_GROUP_ORDER.map((group) => ({
      group,
      entries: decoded.exif?.entries.filter((entry) => entry.group === group) ?? [],
    })).filter((group) => group.entries.length > 0);
  }, [decoded]);

  const resetState = useCallback(() => {
    setDecoded(null);
    setSelectedPlaneIds([PLANE_SPECS[0].id]);
    setActivePlaneId(PLANE_SPECS[0].id);
    setActiveTab("bit-planes");
    setError(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);

      try {
        const result = await decodeImageFile(file);
        setDecoded(result);
        setSelectedPlaneIds([PLANE_SPECS[0].id]);
        setActivePlaneId(PLANE_SPECS[0].id);
        setActiveTab("bit-planes");
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to process this image.";
        setError(message);
        setDecoded(null);
        setSelectedPlaneIds([PLANE_SPECS[0].id]);
        setActivePlaneId(PLANE_SPECS[0].id);
        setActiveTab("bit-planes");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

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

      const nextIndex = (activePlaneIndex + step + PLANE_SPECS.length) % PLANE_SPECS.length;
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
    if (!decoded || selectedPlanes.length === 0) {
      return;
    }

    const extracted = extractBitPlaneStream(decoded.imageData, selectedPlanes, extractionOptions, Number.MAX_SAFE_INTEGER);
    const payload = new Uint8Array(extracted.bytes.byteLength);
    payload.set(extracted.bytes);
    const blob = new Blob([payload], { type: "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildExtractionDownloadName(decoded.filename, selectedPlanes, extractionOptions);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, [decoded, extractionOptions, selectedPlanes]);

  useEffect(() => {
    if (!planeCanvasRef.current) {
      return;
    }

    const canvas = planeCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!decoded || selectedPlanes.length === 0) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const planeImageData =
      selectedPlanes.length === 1
        ? extractBitPlane(decoded.imageData, selectedPlanes[0])
        : extractCombinedBitPlanes(decoded.imageData, selectedPlanes);

    canvas.width = planeImageData.width;
    canvas.height = planeImageData.height;
    context.putImageData(planeImageData, 0, 0);
  }, [decoded, selectedPlanes]);

  useEffect(() => {
    if (!planeStripRef.current) {
      return;
    }

    const activeButton = planeStripRef.current.querySelector<HTMLButtonElement>(`button[data-plane-id="${activePlaneId}"]`);
    activeButton?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activePlaneId]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="animate-fadeInUp rounded-2xl border border-clay/80 bg-paper/80 p-6 shadow-panel backdrop-blur">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">Steganography Toolkit</p>
        <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">Bit-Plane Image Analyzer</h1>
        <p className="mt-3 max-w-3xl text-sm text-ink/80 md:text-base">
          Upload a PNG or JPEG file, then inspect every RGB(A) bit-plane. Plane numbering is <strong>LSB-first</strong>{" "}
          ({`1 = least-significant bit, 8 = most-significant bit`}).
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <label
          className={`group relative flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white/90 p-6 text-center shadow-panel transition ${
            isDragging ? "border-accent bg-accentSoft/40" : "border-clay hover:border-accent/70"
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
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={handleInput}
            aria-label="Upload PNG or JPEG image"
          />

          <span className="rounded-full bg-accentSoft px-4 py-1 font-mono text-xs uppercase tracking-[0.16em] text-accent">
            Upload
          </span>
          <p className="mt-4 text-lg font-semibold text-ink">Drop image here or click to browse</p>
          <p className="mt-2 text-sm text-ink/70">Supported formats: PNG, JPEG</p>
          {isLoading ? <p className="mt-4 font-mono text-sm text-accent">Processing image...</p> : null}
        </label>

        <div className="rounded-2xl border border-clay bg-white/90 p-5 shadow-panel">
          <h2 className="text-base font-semibold text-ink">Image Details</h2>
          {decoded ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <dt className="text-ink/70">Name</dt>
              <dd className="truncate text-right font-medium text-ink">{decoded.filename}</dd>

              <dt className="text-ink/70">Format</dt>
              <dd className="text-right font-mono text-xs uppercase tracking-wide text-ink">{decoded.format}</dd>

              <dt className="text-ink/70">Size</dt>
              <dd className="text-right font-medium text-ink">{formatBytes(decoded.byteSize)}</dd>

              <dt className="text-ink/70">Dimensions</dt>
              <dd className="text-right font-medium text-ink">
                {decoded.width.toLocaleString()} x {decoded.height.toLocaleString()}
              </dd>

              <dt className="text-ink/70">Total planes</dt>
              <dd className="text-right font-medium text-ink">{PLANE_SPECS.length}</dd>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-ink/70">No image loaded.</p>
          )}

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
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-clay bg-white/95 shadow-panel">
        <div className="flex flex-wrap gap-2 border-b border-clay/80 px-4 py-3">
          {ANALYZER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-selected={isActive}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-accent bg-accent text-white"
                    : "border-clay text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 md:p-5">
          {activeTab === "bit-planes" ? (
            <div className="space-y-5">
              <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Bit-Plane Navigator</h2>
                    <p className="text-xs text-ink/70">
                      One row per color channel. Click any bit buttons to toggle multi-selection and combine planes.
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
                      <div key={channelLabel} className="grid gap-2 md:grid-cols-[5.75rem_1fr] md:items-center">
                        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/65">{channelLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          {PLANE_SPECS.filter((plane) => plane.channelLabel === channelLabel).map((plane) => {
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
                    <h3 className="text-base font-semibold text-ink">Selected Plane</h3>
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
                    <p className="mb-3 text-xs text-ink/60">{selectedPlanes.map((plane) => plane.label).join(", ")}</p>
                  ) : (
                    <p className="mb-3 text-xs text-ink/60">
                      Preview is rendered at native pixel resolution (no CSS downsampling).
                    </p>
                  )}
                  <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                    {decoded ? (
                      <canvas
                        ref={planeCanvasRef}
                        className="pixelated block rounded-md bg-black/5"
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
                    <h3 className="text-base font-semibold text-ink">Hex Dump</h3>
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
                            scanOrder: event.target.value as ExtractionScanOrder,
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
                            channelOrder: event.target.value as ExtractionChannelOrder,
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
                            bitOrder: event.target.value as ExtractionBitOrder,
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
                            bytePackOrder: event.target.value as ExtractionBytePackOrder,
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
                      <p>Total bits: {hexDumpView.totalBits.toLocaleString()}</p>
                      <p className="text-right">Total bytes: {hexDumpView.totalBytes.toLocaleString()}</p>
                      <p>Bits per pixel: {hexDumpView.bitsPerPixel.toLocaleString()}</p>
                      <p className="text-right">{hexDumpView.isTruncated ? "Truncated preview" : "Full dump"}</p>
                      <p>Shown bytes: {hexDumpView.shownBytes.toLocaleString()}</p>
                    </div>
                  ) : null}
                  <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
                    {hexDumpView && hexDumpView.shownBytes > 0 ? (
                      <pre className="font-mono text-[11px] leading-relaxed text-ink/90">{hexDumpView.text}</pre>
                    ) : decoded ? (
                      <div className="grid h-40 place-items-center text-sm text-ink/60">
                        No bit plane selected. Select one or more planes to view the hex dump.
                      </div>
                    ) : (
                      <div className="grid h-40 place-items-center text-sm text-ink/60">
                        Upload an image to inspect hex data.
                      </div>
                    )}
                  </div>
                </article>
              </section>
            </div>
          ) : (
            <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">Exif Metadata</h2>
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
                    <article key={group.group} className="overflow-hidden rounded-xl border border-clay bg-white">
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
                                0x{entry.tagId.toString(16).toUpperCase().padStart(4, "0")}
                              </span>
                            </dt>
                            <dd className="break-words text-sm text-ink">{entry.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
