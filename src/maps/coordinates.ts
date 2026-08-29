import type { Coordinates } from "./types";

const NUMBER = "[-+]?\\d{1,3}(?:\\.\\d+)?";
const PAIR = new RegExp(`^\\s*(${NUMBER})\\s*[,;]\\s*(${NUMBER})\\s*$`);
const PAIR_IN_TEXT = new RegExp(`(${NUMBER})\\s*,\\s*(${NUMBER})`);

export function isValidCoordinates(value: Coordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

/** Parses a `lat,lon` pair. The whole string must be the pair. */
export function parseCoordinates(value: string | undefined): Coordinates | undefined {
  if (!value) return undefined;
  const match = value.match(PAIR);
  if (!match) return undefined;
  return toCoordinates(match[1], match[2]);
}

/** Finds the first `lat,lon` pair anywhere inside free text. */
export function findCoordinates(text: string): Coordinates | undefined {
  const match = text.match(PAIR_IN_TEXT);
  if (!match) return undefined;
  return toCoordinates(match[1], match[2]);
}

function toCoordinates(lat: string, lon: string): Coordinates | undefined {
  const coordinates = {
    latitude: Number.parseFloat(lat),
    longitude: Number.parseFloat(lon),
  };
  return isValidCoordinates(coordinates) ? coordinates : undefined;
}

/** `40.416775,-3.70379` — the format every maps app accepts in a URL. */
export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  return `${trimZeros(latitude)},${trimZeros(longitude)}`;
}

function trimZeros(value: number): string {
  // 7 decimals is ~1cm of precision; more only makes URLs longer.
  return String(Number.parseFloat(value.toFixed(7)));
}
