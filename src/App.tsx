import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { DecodedImage } from "./types";
import { buildPlaneSpecs, extractBitPlane } from "./utils/bitPlane";
import { formatBytes } from "./utils/format";
import { decodeImageFile } from "./utils/image";

const PLANE_SPECS = buildPlaneSpecs();

function App() {
  const [decoded, setDecoded] = useState<DecodedImage | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedPlaneId, setSelectedPlaneId] = useState<string>(PLANE_SPECS[0].id);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceUrlRef = useRef<string | null>(null);
  const planeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const planeStripRef = useRef<HTMLDivElement | null>(null);

  const selectedPlane = useMemo(
    () => PLANE_SPECS.find((plane) => plane.id === selectedPlaneId) ?? PLANE_SPECS[0],
    [selectedPlaneId],
  );

  const selectedPlaneIndex = useMemo(
    () => PLANE_SPECS.findIndex((plane) => plane.id === selectedPlane.id),
    [selectedPlane.id],
  );

  const updateSourceUrl = useCallback((nextUrl: string | null) => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
    }

    sourceUrlRef.current = nextUrl;
    setSourceUrl(nextUrl);
  }, []);

  const resetState = useCallback(() => {
    setDecoded(null);
    setSelectedPlaneId(PLANE_SPECS[0].id);
    setError(null);
    updateSourceUrl(null);
  }, [updateSourceUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);

      try {
        const result = await decodeImageFile(file);
        const nextSourceUrl = URL.createObjectURL(file);
        setDecoded(result);
        setSelectedPlaneId(PLANE_SPECS[0].id);
        updateSourceUrl(nextSourceUrl);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to process this image.";
        setError(message);
        setDecoded(null);
        updateSourceUrl(null);
      } finally {
        setIsLoading(false);
      }
    },
    [updateSourceUrl],
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

  const movePlane = useCallback(
    (step: 1 | -1) => {
      if (selectedPlaneIndex < 0) {
        return;
      }

      const nextIndex = (selectedPlaneIndex + step + PLANE_SPECS.length) % PLANE_SPECS.length;
      setSelectedPlaneId(PLANE_SPECS[nextIndex].id);
    },
    [selectedPlaneIndex],
  );

  useEffect(() => {
    if (!planeCanvasRef.current) {
      return;
    }

    const canvas = planeCanvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (!decoded) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const planeImageData = extractBitPlane(decoded.imageData, selectedPlane);
    canvas.width = planeImageData.width;
    canvas.height = planeImageData.height;
    context.putImageData(planeImageData, 0, 0);
  }, [decoded, selectedPlane]);

  useEffect(() => {
    if (!planeStripRef.current) {
      return;
    }

    const selectedButton = planeStripRef.current.querySelector<HTMLButtonElement>(
      `button[data-plane-id="${selectedPlaneId}"]`,
    );
    selectedButton?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedPlaneId]);

  useEffect(
    () => () => {
      if (sourceUrlRef.current) {
        URL.revokeObjectURL(sourceUrlRef.current);
      }
    },
    [],
  );

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

      <section className="rounded-2xl border border-clay bg-white/95 p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Bit-Plane Navigator</h2>
            <p className="text-xs text-ink/70">Use controls or scroll the list to jump between channel bit-planes.</p>
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
          </div>
        </div>

        <div ref={planeStripRef} className="flex gap-2 overflow-x-auto pb-2">
          {PLANE_SPECS.map((plane) => {
            const isSelected = plane.id === selectedPlaneId;

            return (
              <button
                key={plane.id}
                type="button"
                data-plane-id={plane.id}
                onClick={() => setSelectedPlaneId(plane.id)}
                disabled={!decoded}
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition ${
                  isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-clay text-ink hover:border-accent hover:text-accent"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {plane.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 pb-2 lg:grid-cols-2">
        <article className="rounded-2xl border border-clay bg-white/95 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">Selected Plane</h3>
            <span className="rounded-full bg-accentSoft px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent">
              {selectedPlane.label}
            </span>
          </div>
          <p className="mb-3 text-xs text-ink/70">
            {selectedPlane.bitPosition === 1
              ? "Least-significant bit plane."
              : selectedPlane.bitPosition === 8
                ? "Most-significant bit plane."
                : "Intermediate bit plane."}
          </p>
          <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
            <canvas
              ref={planeCanvasRef}
              className="pixelated mx-auto max-h-[60vh] max-w-full rounded-md bg-black/5"
              aria-label={`Visualized ${selectedPlane.label} bit plane`}
            />
            {!decoded ? (
              <div className="grid h-40 place-items-center text-sm text-ink/60">Upload an image to render bit-planes.</div>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-clay bg-white/95 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">Original Image</h3>
          </div>
          <div className="overflow-auto rounded-xl border border-clay bg-white p-2">
            {sourceUrl ? (
              <img
                src={sourceUrl}
                alt="Original uploaded image"
                className="mx-auto block max-h-[60vh] max-w-full rounded-md object-contain"
              />
            ) : (
              <div className="grid h-40 place-items-center text-sm text-ink/60">No source image loaded.</div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
