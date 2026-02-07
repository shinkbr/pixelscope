# Web Stego: Bit-Plane Analyzer

A Vite + React + Tailwind web app for steganography-focused image inspection.

## Features

- Upload `PNG` and `JPEG` images in-browser (no server required).
- Bit-plane analysis for all channels:
  - `Red 1..8`
  - `Green 1..8`
  - `Blue 1..8`
  - `Alpha 1..8`
- Plane browsing via:
  - Horizontal scroll list
  - `Prev` / `Next` controls
- Side-by-side view:
  - Original image
  - Selected bit-plane rendering
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
```

## Technical notes

- Image decoding uses `createImageBitmap` when available, with an `HTMLImageElement` fallback.
- Pixel extraction is done with browser `CanvasRenderingContext2D#getImageData`.
- Each bit-plane is rendered as a binary monochrome image (`white = bit set`, `black = bit not set`).
