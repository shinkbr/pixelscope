import { parse as parseExif } from "exifr";
import type {
  ExifEntry,
  ExifGroup,
  ExifLocation,
  ExifMetadata,
} from "../types";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_MIN_LENGTH = 120;
const MAX_SERIALIZED_LENGTH = 20_000;
const GPS_SEARCH_DEPTH = 8;
const LATITUDE_KEYS = new Set(["gpslatitude", "latitude", "lat"]);
const LONGITUDE_KEYS = new Set(["gpslongitude", "longitude", "lng", "lon"]);
const LATITUDE_REF_KEYS = new Set(["gpslatituderef", "latituderef"]);
const LONGITUDE_REF_KEYS = new Set(["gpslongituderef", "longituderef"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeGpsKey(key: string): string {
  return key.replace(/[^a-z]/gi, "").toLowerCase();
}

function collectValuesByKeySet(
  value: unknown,
  keys: Set<string>,
  output: unknown[],
  depth: number,
): void {
  if (depth > GPS_SEARCH_DEPTH) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectValuesByKeySet(item, keys, output, depth + 1);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.has(normalizeGpsKey(key))) {
      output.push(nestedValue);
    }
    collectValuesByKeySet(nestedValue, keys, output, depth + 1);
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const firstNumericPart = normalized.match(/[-+]?\d+(\.\d+)?/);
    if (!firstNumericPart) {
      return null;
    }
    const fallback = Number(firstNumericPart[0]);
    return Number.isFinite(fallback) ? fallback : null;
  }

  return null;
}

function parseCoordinatePair(value: unknown): ExifLocation | null {
  if (Array.isArray(value) && value.length >= 2) {
    const latitude = toFiniteNumber(value[0]);
    const longitude = toFiniteNumber(value[1]);
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude };
    }
  }

  if (typeof value === "string") {
    const matches = value.match(/[-+]?\d+(\.\d+)?/g);
    if (matches && matches.length >= 2) {
      const latitude = Number(matches[0]);
      const longitude = Number(matches[1]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

function parseSingleCoordinate(value: unknown): number | null {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    if (value.length === 2) {
      const first = toFiniteNumber(value[0]);
      const second = toFiniteNumber(value[1]);
      if (first !== null && second !== null && Math.abs(second) > 60) {
        return first;
      }
    }

    const numericValues = value
      .map((item) => toFiniteNumber(item))
      .filter((item): item is number => item !== null);

    if (numericValues.length === 0) {
      return null;
    }

    if (numericValues.length === 1) {
      return numericValues[0];
    }

    const sign = numericValues[0] < 0 ? -1 : 1;
    const degrees = Math.abs(numericValues[0]);
    const minutes = Math.abs(numericValues[1] ?? 0);
    const seconds = Math.abs(numericValues[2] ?? 0);

    return sign * (degrees + minutes / 60 + seconds / 3600);
  }

  return toFiniteNumber(value);
}

function findDirection(values: unknown[]): "N" | "S" | "E" | "W" | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const match = value.toUpperCase().match(/[NSEW]/);
    if (match?.[0] === "N") {
      return "N";
    }
    if (match?.[0] === "S") {
      return "S";
    }
    if (match?.[0] === "E") {
      return "E";
    }
    if (match?.[0] === "W") {
      return "W";
    }
  }

  return null;
}

function applyDirection(
  coordinate: number,
  direction: "N" | "S" | "E" | "W" | null,
  axis: "lat" | "lon",
): number {
  if (!direction) {
    return coordinate;
  }

  if (axis === "lat" && (direction === "N" || direction === "S")) {
    return direction === "S" ? -Math.abs(coordinate) : Math.abs(coordinate);
  }

  if (axis === "lon" && (direction === "E" || direction === "W")) {
    return direction === "W" ? -Math.abs(coordinate) : Math.abs(coordinate);
  }

  return coordinate;
}

function isValidCoordinatePair(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function extractGpsLocation(
  parsed: Record<string, unknown>,
): ExifLocation | null {
  const latitudeValues: unknown[] = [];
  const longitudeValues: unknown[] = [];
  const latitudeRefValues: unknown[] = [];
  const longitudeRefValues: unknown[] = [];

  collectValuesByKeySet(parsed, LATITUDE_KEYS, latitudeValues, 0);
  collectValuesByKeySet(parsed, LONGITUDE_KEYS, longitudeValues, 0);
  collectValuesByKeySet(parsed, LATITUDE_REF_KEYS, latitudeRefValues, 0);
  collectValuesByKeySet(parsed, LONGITUDE_REF_KEYS, longitudeRefValues, 0);

  const latitudeDirection = findDirection(latitudeRefValues);
  const longitudeDirection = findDirection(longitudeRefValues);

  for (const latitudeValue of latitudeValues) {
    const latitude = parseSingleCoordinate(latitudeValue);
    if (latitude === null) {
      continue;
    }

    for (const longitudeValue of longitudeValues) {
      const longitude = parseSingleCoordinate(longitudeValue);
      if (longitude === null) {
        continue;
      }

      const normalizedLatitude = applyDirection(
        latitude,
        latitudeDirection,
        "lat",
      );
      const normalizedLongitude = applyDirection(
        longitude,
        longitudeDirection,
        "lon",
      );

      if (isValidCoordinatePair(normalizedLatitude, normalizedLongitude)) {
        return {
          latitude: normalizedLatitude,
          longitude: normalizedLongitude,
        };
      }
    }
  }

  for (const pairCandidate of [...latitudeValues, ...longitudeValues]) {
    const pair = parseCoordinatePair(pairCandidate);
    if (!pair) {
      continue;
    }

    const normalizedLatitude = applyDirection(
      pair.latitude,
      latitudeDirection,
      "lat",
    );
    const normalizedLongitude = applyDirection(
      pair.longitude,
      longitudeDirection,
      "lon",
    );

    if (isValidCoordinatePair(normalizedLatitude, normalizedLongitude)) {
      return {
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
      };
    }
  }

  return null;
}

function getExifGroup(tagPath: string): ExifGroup {
  const normalized = tagPath.toLowerCase();

  if (
    normalized.startsWith("gps") ||
    normalized.includes("gps") ||
    normalized.includes("latitude") ||
    normalized.includes("longitude")
  ) {
    return "gps";
  }

  if (normalized.includes("interop")) {
    return "interop";
  }

  if (normalized.includes("thumbnail") || normalized.includes("ifd1")) {
    return "ifd1";
  }

  if (
    normalized.includes("exif") ||
    normalized.includes("usercomment") ||
    normalized.includes("xpcomment") ||
    normalized.includes("fnumber") ||
    normalized.includes("exposure") ||
    normalized.includes("iso") ||
    normalized.includes("lens") ||
    normalized.includes("shutter") ||
    normalized.includes("aperture") ||
    normalized.includes("focal")
  ) {
    return "exif";
  }

  return "ifd0";
}

function truncate(value: string, maxLength = MAX_SERIALIZED_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)} …`;
}

function primitiveToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? truncate(normalized) : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    if (bytes.length === 0) {
      return null;
    }

    const preview = Array.from(bytes)
      .slice(0, 64)
      .map((byteValue) => byteValue.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
    return bytes.length > 64 ? `0x${preview}...` : `0x${preview}`;
  }

  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value);
    if (bytes.length === 0) {
      return null;
    }

    const preview = Array.from(bytes)
      .slice(0, 64)
      .map((byteValue) => byteValue.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
    return bytes.length > 64 ? `0x${preview}...` : `0x${preview}`;
  }

  return null;
}

function collectBase64Candidates(value: string): string[] {
  const candidates = new Set<string>();

  const searchSpaces = [value, value.split("\u0000").join("")];
  for (const searchSpace of searchSpaces) {
    const chunks = searchSpace.match(/[A-Za-z0-9+/=\s]{120,}/g) ?? [];

    for (const chunk of chunks) {
      const normalized = chunk.replace(/\s+/g, "");
      if (normalized.length < BASE64_MIN_LENGTH) {
        continue;
      }

      if (normalized.length % 4 !== 0) {
        continue;
      }

      if (!BASE64_PATTERN.test(normalized)) {
        continue;
      }

      candidates.add(normalized);
    }
  }

  return Array.from(candidates);
}

function pushEntry(
  entries: ExifEntry[],
  dedupe: Set<string>,
  group: ExifGroup,
  tagName: string,
  value: string,
): void {
  const normalizedTagName = tagName.length > 0 ? tagName : "(unknown)";
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return;
  }

  const key = `${group}|${normalizedTagName}|${normalizedValue}`;
  if (dedupe.has(key)) {
    return;
  }

  dedupe.add(key);
  entries.push({
    group,
    tagId: 0,
    tagName: normalizedTagName,
    value: truncate(normalizedValue),
  });
}

function flattenMetadata(
  value: unknown,
  path: string,
  entries: ExifEntry[],
  dedupe: Set<string>,
  depth: number,
): void {
  if (depth > 6) {
    return;
  }

  const primitive = primitiveToString(value);
  if (primitive !== null) {
    const group = getExifGroup(path);
    pushEntry(entries, dedupe, group, path || "Value", primitive);

    if (typeof value === "string") {
      const candidates = collectBase64Candidates(value);
      for (let index = 0; index < candidates.length; index += 1) {
        const tagName =
          candidates.length > 1 ? `Base64Payload${index + 1}` : "Base64Payload";
        pushEntry(entries, dedupe, "exif", tagName, candidates[index]);
      }
    }

    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return;
    }

    const allPrimitive = value.every(
      (item) => primitiveToString(item) !== null,
    );
    if (allPrimitive) {
      const serialized = value
        .map((item) => primitiveToString(item))
        .filter((item): item is string => item !== null)
        .join(", ");
      if (serialized.length > 0) {
        pushEntry(
          entries,
          dedupe,
          getExifGroup(path),
          path || "Value",
          serialized,
        );
        for (const candidate of collectBase64Candidates(serialized)) {
          pushEntry(entries, dedupe, "exif", "Base64Payload", candidate);
        }
      }
      return;
    }

    for (let index = 0; index < value.length; index += 1) {
      const itemPath = path ? `${path}[${index}]` : `[${index}]`;
      flattenMetadata(value[index], itemPath, entries, dedupe, depth + 1);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = path ? `${path}.${key}` : key;
      flattenMetadata(nestedValue, nestedPath, entries, dedupe, depth + 1);
    }
  }
}

function sortEntries(entries: ExifEntry[]): ExifEntry[] {
  const groupRank: Record<ExifGroup, number> = {
    ifd0: 0,
    exif: 1,
    gps: 2,
    interop: 3,
    ifd1: 4,
  };

  return [...entries].sort((a, b) => {
    const rankDelta = groupRank[a.group] - groupRank[b.group];
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return a.tagName.localeCompare(b.tagName);
  });
}

export const __exifInternals = {
  normalizeGpsKey,
  collectValuesByKeySet,
  toFiniteNumber,
  parseCoordinatePair,
  parseSingleCoordinate,
  findDirection,
  applyDirection,
  extractGpsLocation,
  primitiveToString,
  collectBase64Candidates,
  pushEntry,
  flattenMetadata,
};

export async function readExifMetadata(
  file: File,
): Promise<ExifMetadata | null> {
  try {
    const parsed = await parseExif(file, {
      tiff: true,
      ifd0: {},
      ifd1: true,
      exif: true,
      gps: true,
      interop: true,
      xmp: true,
      icc: true,
      iptc: true,
      jfif: true,
      ihdr: true,
      multiSegment: true,
      skip: [],
      translateValues: false,
      reviveValues: false,
    });

    if (!isRecord(parsed)) {
      return null;
    }

    const entries: ExifEntry[] = [];
    const dedupe = new Set<string>();

    flattenMetadata(parsed, "", entries, dedupe, 0);

    if (entries.length === 0) {
      const serialized = JSON.stringify(parsed);
      if (serialized) {
        for (const candidate of collectBase64Candidates(serialized)) {
          pushEntry(entries, dedupe, "exif", "Base64Payload", candidate);
        }
      }
    }

    if (entries.length === 0) {
      return null;
    }

    return {
      source: "exifr",
      entries: sortEntries(entries),
      location: extractGpsLocation(parsed),
    };
  } catch {
    return null;
  }
}
