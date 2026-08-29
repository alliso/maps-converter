import { isValidCoordinates } from "./coordinates";
import type { Coordinates } from "./types";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
/** Nominatim's usage policy asks that apps identify themselves. */
const USER_AGENT = "MapsConverter/0.1 (https://github.com/alliso/Maps-converter)";
const DEFAULT_TIMEOUT_MS = 6000;

export type GeocodeResult = {
  coordinates: Coordinates;
  /** Full address as OpenStreetMap knows it, so a wrong match is visible. */
  address: string;
};

export type GeocodeOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** BCP-47 tag, so results come back in the user's language. */
  language?: string;
};

/**
 * Turns a place name into coordinates using OpenStreetMap's free geocoder — no
 * API key, one request per share, which is well inside its usage policy.
 *
 * Returns undefined rather than throwing: a failed lookup just means the
 * destination app searches for the name itself, which is the old behaviour.
 */
export async function geocode(
  query: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, language }: GeocodeOptions = {},
): Promise<GeocodeResult | undefined> {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(trimmed)}`;
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(language ? { "Accept-Language": language } : {}),
      },
    });
    if (!response.ok) return undefined;

    const [match] = (await response.json()) as unknown[];
    return toResult(match);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function toResult(match: unknown): GeocodeResult | undefined {
  if (!match || typeof match !== "object") return undefined;
  const { lat, lon, display_name: displayName } = match as Record<string, unknown>;

  const coordinates = {
    latitude: Number.parseFloat(String(lat)),
    longitude: Number.parseFloat(String(lon)),
  };
  if (!isValidCoordinates(coordinates)) return undefined;

  return {
    coordinates,
    address: typeof displayName === "string" ? displayName : "",
  };
}
