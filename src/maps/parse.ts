import { findCoordinates, parseCoordinates } from "./coordinates";
import { decodeGeohash } from "./geohash";
import type { Coordinates, MapAppId, ParseResult, Place } from "./types";
import { decodeComponent, extractUrl, parseUrl, type SimpleUrl } from "./url";

/** Google buries the actual pin in the `data=` payload as `!3d<lat>!4d<lon>`. */
const GOOGLE_DATA_PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
/** `/@40.41,-3.70,17z` — the camera position, used only as a last resort. */
const AT_COORDINATES = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
/** `40.4,-3.7(Label)` — the geo: URI way of naming a pin. */
const LABELLED_COORDINATES = /^\s*([^()]+?)\s*\(([^)]+)\)\s*$/;

const MAX_QUERY_LENGTH = 250;

/**
 * Google's `share.google` links resolve to an ordinary search page rather than
 * a maps URL. `source=sh/x/loc/…` is what marks it as a shared location — the
 * tail varies with what was shared (`loc/geo` for a place on the map,
 * `loc/uni` for a business).
 */
const LOCATION_SEARCH_MARKER = "sh/x/loc";
/** That search reads "mapa de <sitio>"; the prefix is noise for another app. */
const MAP_OF_PREFIX =
  /^(?:mapa (?:de|da|do)|map of|carte de|mappa di|karte von|kaart van)\s+/i;

/**
 * Turns whatever a maps app put on the share sheet into a place we can open
 * somewhere else. Accepts a bare URL or a message with a URL inside it.
 */
export function parseSharedContent(text: string | null | undefined): ParseResult {
  const trimmed = text?.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const rawUrl = extractUrl(trimmed);
  if (rawUrl) {
    const result = parseMapUrl(rawUrl);
    if (result?.ok) {
      // Maps apps put the place name in the message and the link underneath, so
      // the surrounding text is the best label a short link will ever get.
      const label = result.place.label ?? labelFromText(trimmed, rawUrl);
      return { ...result, place: { ...result.place, label } };
    }
    if (result) return result;
  }

  // No usable URL, but a plain message may still carry a pair of coordinates,
  // e.g. "estoy en 40.416775, -3.703790".
  const coordinates = findCoordinates(trimmed);
  if (coordinates) return { ok: true, place: { coordinates, sourceUrl: rawUrl } };

  if (rawUrl) return { ok: false, reason: "unsupported", url: rawUrl };

  // Anything short enough is treated as an address to search for.
  if (trimmed.length <= MAX_QUERY_LENGTH) {
    return { ok: true, place: { query: trimmed, label: trimmed } };
  }
  return { ok: false, reason: "unsupported" };
}

/** Parses a single URL. Returns undefined when it is not a maps URL at all. */
export function parseMapUrl(rawUrl: string): ParseResult | undefined {
  const url = parseUrl(rawUrl);
  if (!url) return undefined;

  if (url.scheme === "geo") return parseGeoUri(url, rawUrl);

  const source = identifySource(url);
  if (!source) return undefined;

  if (isShortLink(url)) {
    return { ok: true, needsResolution: true, place: { source, sourceUrl: rawUrl } };
  }

  const place =
    source === "apple"
      ? parseApple(url)
      : source === "google"
        ? parseGoogle(url)
        : parseWaze(url);

  if (!place.coordinates && !place.query) {
    return { ok: false, reason: "unsupported", url: rawUrl };
  }
  return { ok: true, place: { ...place, source, sourceUrl: rawUrl } };
}

/** Which maps app produced this URL, when we can tell. */
export function identifySource(url: SimpleUrl): MapAppId | undefined {
  if (url.scheme === "maps") return "apple";
  if (url.scheme === "comgooglemaps") return "google";
  if (url.scheme === "waze") return "waze";
  if (url.scheme !== "http" && url.scheme !== "https") return undefined;

  const host = url.host;
  if (host === "maps.apple.com" || host.endsWith(".maps.apple.com")) return "apple";
  if (host === "waze.com" || host.endsWith(".waze.com")) return "waze";
  if (host === "maps.app.goo.gl" || host === "goo.gl" || host === "share.google") {
    return "google";
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    if (host.startsWith("maps.") || url.path.startsWith("/maps")) return "google";
    return isLocationSearch(url) ? "google" : undefined;
  }
  return undefined;
}

/** A Google search that came from sharing a place, not an ordinary search. */
function isLocationSearch(url: SimpleUrl): boolean {
  return (
    url.path === "/search" && (url.params.get("source") ?? "").includes(LOCATION_SEARCH_MARKER)
  );
}

/**
 * Last resort for a short link that expands to a Google search: the place name
 * is in `q`, which every maps app can search for.
 */
export function parseGoogleSearch(rawUrl: string): ParseResult | undefined {
  const url = parseUrl(rawUrl);
  if (!url || !/(^|\.)google\.[a-z.]+$/.test(url.host)) return undefined;

  const query = stripMapOfPrefix(nonCoordinate(url.params.get("q")));
  if (!query) return undefined;

  return { ok: true, place: { query, label: query, source: "google", sourceUrl: rawUrl } };
}

function stripMapOfPrefix(value: string | undefined): string | undefined {
  return value?.replace(MAP_OF_PREFIX, "").trim() || undefined;
}

/**
 * True for links that are only a redirect (`maps.app.goo.gl/xyz`): they carry
 * no coordinates, so they have to be expanded over the network first.
 */
export function isShortLink(url: SimpleUrl): boolean {
  if (url.host === "maps.app.goo.gl" || url.host === "share.google") return true;
  if (url.host === "goo.gl") return url.path.startsWith("/maps");
  // Waze's `/ul/h<geohash>` is short but self-describing, so it is not here.
  return false;
}

function parseApple(url: SimpleUrl): Place {
  const p = url.params;
  const place: Place = {};

  place.coordinates =
    parseCoordinates(p.get("coordinate")) ??
    parseCoordinates(p.get("ll")) ??
    parseCoordinates(p.get("sll")) ??
    parseCoordinates(p.get("center")) ??
    parseCoordinates(p.get("q")) ??
    parseCoordinates(p.get("daddr"));

  const name = p.get("name") ?? nonCoordinate(p.get("q"));
  const address = p.get("address") ?? nonCoordinate(p.get("daddr"));
  place.label = name ?? address;
  place.query = name ?? address;

  return place;
}

function parseGoogle(url: SimpleUrl): Place {
  const p = url.params;
  const place: Place = {};
  const segments = url.path.split("/").filter(Boolean).map(decodeComponent);

  // `/maps/place/<name>/@…` — the segment right after the mode is the place.
  const modeIndex = segments.findIndex((segment) =>
    ["place", "search", "dir"].includes(segment),
  );
  const pathTarget =
    modeIndex === -1
      ? undefined
      : segments
          .slice(modeIndex + 1)
          .filter((segment) => !segment.startsWith("@") && !segment.startsWith("data="))
          .pop();

  const paramTarget =
    p.get("query") ?? p.get("q") ?? p.get("destination") ?? p.get("daddr") ?? p.get("viewpoint");

  // The `data=` pin beats everything else: `@lat,lng` is only where the camera
  // was pointing when the link was made.
  const dataPin = url.path.match(GOOGLE_DATA_PIN) ?? url.rawQuery.match(GOOGLE_DATA_PIN);
  const cameraPin = url.path.match(AT_COORDINATES);

  place.coordinates =
    toCoordinates(dataPin) ??
    parseCoordinates(paramTarget) ??
    parseCoordinates(p.get("ll")) ??
    parseCoordinates(p.get("center")) ??
    parseCoordinates(pathTarget) ??
    toCoordinates(cameraPin);

  const name = stripMapOfPrefix(nonCoordinate(paramTarget) ?? nonCoordinate(pathTarget));
  place.label = name;
  place.query = name;

  return place;
}

function parseWaze(url: SimpleUrl): Place {
  const p = url.params;
  const place: Place = {};

  // `/live-map/directions?to=ll.40.4,-3.7`
  const prefixed = [p.get("to"), p.get("from"), p.get("latlng")]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^ll\./, ""));

  // `/ul/h<geohash>`
  const geohashMatch = url.path.match(/^\/ul\/h([0-9bcdefghjkmnpqrstuvwxyz]+)$/i);

  place.coordinates =
    parseCoordinates(p.get("ll")) ??
    prefixed.map(parseCoordinates).find(Boolean) ??
    parseCoordinates(p.get("q")) ??
    (geohashMatch ? decodeGeohash(geohashMatch[1]) : undefined);

  const name = nonCoordinate(p.get("q")) ?? nonCoordinate(prefixed[0]);
  place.label = name;
  place.query = name;

  return place;
}

/** `geo:40.4,-3.7` and `geo:0,0?q=40.4,-3.7(Home)`, the Android standard. */
function parseGeoUri(url: SimpleUrl, rawUrl: string): ParseResult {
  const place: Place = { sourceUrl: rawUrl };
  const q = url.params.get("q");
  const labelled = q?.match(LABELLED_COORDINATES);
  const target = labelled ? labelled[1] : q;

  place.coordinates = parseCoordinates(target) ?? parseCoordinates(url.path);
  place.label = labelled ? labelled[2] : nonCoordinate(target);
  place.query = nonCoordinate(target) ?? place.label;

  // `geo:0,0` is the documented placeholder for "no coordinates, use q".
  if (place.coordinates?.latitude === 0 && place.coordinates.longitude === 0 && place.query) {
    place.coordinates = undefined;
  }

  if (!place.coordinates && !place.query) {
    return { ok: false, reason: "unsupported", url: rawUrl };
  }
  return { ok: true, place };
}

/**
 * The first line of a shared message that is neither the link nor a coordinate
 * pair, e.g. the "Puerta del Sol" above a `maps.app.goo.gl` link.
 */
function labelFromText(text: string, rawUrl: string): string | undefined {
  const line = text
    .split(/[\r\n]+/)
    .map((value) => value.trim())
    .find((value) => value && value !== rawUrl && !value.includes(rawUrl) && !parseCoordinates(value));

  return line && line.length <= 120 ? line : undefined;
}

/** Returns the value only when it is a name, not a coordinate pair. */
function nonCoordinate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return parseCoordinates(value) ? undefined : value;
}

function toCoordinates(match: RegExpMatchArray | null): Coordinates | undefined {
  if (!match) return undefined;
  return parseCoordinates(`${match[1]},${match[2]}`);
}
