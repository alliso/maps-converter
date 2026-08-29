/** Identifier of a maps app we can read from and open into. */
export type MapAppId = "apple" | "google" | "waze";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/**
 * A destination extracted from shared content. Either `coordinates`, `query` or
 * both are present — a place with only a name still opens fine as a search.
 */
export type Place = {
  coordinates?: Coordinates;
  /** Free-text search term (name or address) when there are no coordinates. */
  query?: string;
  /** Human readable name, used for the pin label and the UI. */
  label?: string;
  /** Address the coordinates were geocoded from, shown to expose a bad match. */
  address?: string;
  /** App the content was shared from, when we could tell. */
  source?: MapAppId;
  /** The URL the place was parsed from, kept for debugging and fallbacks. */
  sourceUrl?: string;
};

/** Result of parsing shared content that we could not turn into a place. */
export type ParseFailure = {
  ok: false;
  /** Why we could not parse it, for the empty state in the UI. */
  reason: "empty" | "unsupported";
  /** The URL we found but did not understand, if any. */
  url?: string;
};

export type ParseSuccess = {
  ok: true;
  place: Place;
  /** True when the URL needs a network round trip before it yields a place. */
  needsResolution?: boolean;
};

export type ParseResult = ParseSuccess | ParseFailure;
