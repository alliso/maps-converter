import { geocode } from "./geocode";
import { parseGoogleSearch, parseMapUrl, parseSharedContent } from "./parse";
import type { ParseResult, Place } from "./types";

export type ResolveOptions = {
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** BCP-47 tag passed to the geocoder. */
  language?: string;
  /** Set to skip turning a place name into coordinates. */
  skipGeocoding?: boolean;
  /** Injectable for tests. */
  geocodeImpl?: typeof geocode;
};

const DEFAULT_TIMEOUT_MS = 8000;
/**
 * A desktop browser gets Firebase's dynamic-link interstitial, which keeps the
 * destination in obfuscated script; a phone gets the plain 302 that names it.
 */
const PHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
/** `share.google` does the opposite, and only spells the target out to a desktop. */
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAPS_URL_IN_HTML = /https?:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/maps[^"'\\\s<>]*/i;

/**
 * Parses shared content, expanding short links (`maps.app.goo.gl/…`) over the
 * network when they carry no coordinates of their own.
 */
export async function resolveSharedContent(
  text: string | null | undefined,
  options: ResolveOptions = {},
): Promise<ParseResult> {
  const resolved = await expandIfNeeded(text, options);
  if (!resolved.ok) return resolved;

  return { ...resolved, place: await withCoordinates(resolved.place, options) };
}

/**
 * A place we only know by name opens as a search, which leaves the destination
 * app guessing. Geocoding turns it into an exact pin; failing that, the search
 * still happens.
 */
async function withCoordinates(place: Place, options: ResolveOptions): Promise<Place> {
  if (place.coordinates || !place.query || options.skipGeocoding) return place;

  const geocodeImpl = options.geocodeImpl ?? geocode;
  const match = await geocodeImpl(place.query, {
    fetchImpl: options.fetchImpl,
    language: options.language,
  });
  if (!match) return place;

  return { ...place, coordinates: match.coordinates, address: match.address };
}

async function expandIfNeeded(
  text: string | null | undefined,
  options: ResolveOptions,
): Promise<ParseResult> {
  const parsed = parseSharedContent(text);
  if (!parsed.ok || !parsed.needsResolution || !parsed.place.sourceUrl) return parsed;

  const expanded = await expandShortLink(parsed.place.sourceUrl, options);
  if (!expanded) {
    // Offline, or the shortener is unreachable. Maps apps put the place name in
    // the message above the link, so a search for it beats giving up.
    const label = parsed.place.label;
    return label
      ? { ok: true, place: { ...parsed.place, query: label } }
      : { ok: false, reason: "unsupported", url: parsed.place.sourceUrl };
  }

  // `share.google` links land on a Google search page, so the search term is
  // the only thing left to go on when the expanded URL is not a maps URL.
  const parsedExpanded = parseMapUrl(expanded);
  const reparsed = parsedExpanded?.ok ? parsedExpanded : parseGoogleSearch(expanded);
  if (!reparsed || !reparsed.ok || reparsed.needsResolution) {
    return { ok: false, reason: "unsupported", url: expanded };
  }
  return {
    ok: true,
    place: {
      ...reparsed.place,
      // A name found in the shared message survives the expansion, and so does
      // the link the user actually shared.
      label: reparsed.place.label ?? parsed.place.label,
      sourceUrl: parsed.place.sourceUrl,
    },
  };
}

/** Follows a short link and returns the long URL it points at. */
export async function expandShortLink(
  shortUrl: string,
  options: ResolveOptions = {},
): Promise<string | undefined> {
  // A HEAD as a phone is what `maps.app.goo.gl` answers with a real 302; ask as
  // a desktop browser and Google serves an interstitial with nothing in it.
  const head = await request(shortUrl, "HEAD", PHONE_USER_AGENT, options);
  if (head?.url && head.url !== shortUrl) return head.url;

  const response = await request(shortUrl, "GET", DESKTOP_USER_AGENT, options);
  if (!response) return undefined;
  if (response.url && response.url !== shortUrl) return response.url;

  // Older interstitials spell the target out in the markup.
  try {
    const html = await response.text();
    return html.match(MAPS_URL_IN_HTML)?.[0];
  } catch {
    return undefined;
  }
}

async function request(
  url: string,
  method: "HEAD" | "GET",
  userAgent: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }: ResolveOptions,
): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": userAgent, Accept: "text/html" },
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
