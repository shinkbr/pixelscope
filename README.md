# Web Stego: Bit-Plane Analyzer

A Vite + React + Tailwind web app for steganography-focused image inspection.

## Features

- Upload `PNG` and `JPEG` images in-browser (no server required).
- Bit-plane analysis for all channels:
  - `Red 1..8`
  - `Green 1..8`
  - `Blue 1..8`
  - `Alpha 1..8`
- Bit-plane navigator grouped into 4 rows (Red, Green, Blue, Alpha).
- Multi-select bit planes and view a combined render of all selected planes.
- Plane browsing via `Prev` / `Next` controls (single-selects the navigated plane).
- Side-by-side view:
  - Selected bit-plane rendering
  - Hex dump using ordered bit extraction from selected planes
  - Download extracted binary data (`.bin`) for the current selection/settings
- Configurable extraction settings for the Hex Dump:
  - Pixel scan order (`row-major` or `column-major`)
  - Channel traversal order (`RGBA`, `BGRA`, `ARGB`, `ABGR`)
  - Bit traversal order (`LSB -> MSB` or `MSB -> LSB`)
  - Byte packing direction (`MSB first` or `LSB first`)
- Metadata panel:
  - File name, format, size, dimensions

> Plane numbering is LSB-first (`1 = least-significant bit`, `8 = most-significant bit`).

## Development

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Build

```bash
npm run build
npm run preview
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
```

## Technical notes

- Image decoding uses `createImageBitmap` when available, with an `HTMLImageElement` fallback.
- Pixel extraction is done with browser `CanvasRenderingContext2D#getImageData`.
- Each bit-plane is rendered as a binary monochrome image (`white = bit set`, `black = bit not set`).
- Hex extraction concatenates selected plane bits in configured order, then repacks into bytes.
- Hex dump is presented as offset + hex + ASCII, with large dumps truncated for UI performance.
