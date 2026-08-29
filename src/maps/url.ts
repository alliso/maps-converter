/**
 * Minimal URL splitting.
 *
 * React Native's built-in `URL` is a partial implementation (notably
 * `searchParams` is not dependable), so we parse by hand to get identical
 * behaviour in Node tests and on device.
 */
export type SimpleUrl = {
  /** Lowercase scheme without the colon, e.g. `https`, `geo`, `waze`. */
  scheme: string;
  /** Lowercase host without port, empty for scheme-only URLs like `geo:`. */
  host: string;
  /** Path with percent-escapes intact, e.g. `/maps/place/Name/@40,-3,17z`. */
  path: string;
  /** Query values, already percent-decoded. Keys are lowercased. */
  params: Map<string, string>;
  /** Raw query string, needed for values that must not be decoded. */
  rawQuery: string;
};

const URL_PATTERN =
  /\b(?:https?|geo|maps|comgooglemaps|waze|yandexmaps|citymapper):(?:\/\/)?[^\s<>"']+/i;

/** Returns the first URL-looking substring, or undefined. */
export function extractUrl(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  return match ? trimTrailingPunctuation(match[0]) : undefined;
}

const count = (text: string, char: string) =>
  text.split(char).length - 1;

/**
 * Drops punctuation that belongs to the surrounding sentence rather than the
 * URL. Brackets are only dropped when they are unbalanced, so labels such as
 * `geo:0,0?q=40.4,-3.7(Home)` survive.
 */
function trimTrailingPunctuation(url: string): string {
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === "." || last === "," || last === ";" || last === ":") {
      out = out.slice(0, -1);
    } else if (last === ")" && count(out, "(") < count(out, ")")) {
      out = out.slice(0, -1);
    } else if (last === "]" && count(out, "[") < count(out, "]")) {
      out = out.slice(0, -1);
    } else {
      break;
    }
  }
  return out;
}

export function parseUrl(input: string): SimpleUrl | undefined {
  const schemeEnd = input.indexOf(":");
  if (schemeEnd <= 0) return undefined;

  const scheme = input.slice(0, schemeEnd).toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) return undefined;

  let rest = input.slice(schemeEnd + 1);
  let host = "";
  if (rest.startsWith("//")) {
    rest = rest.slice(2);
    const hostEnd = rest.search(/[/?#]/);
    const authority = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
    rest = hostEnd === -1 ? "" : rest.slice(hostEnd);
    // Drop userinfo and port.
    host = authority.split("@").pop()!.split(":")[0].toLowerCase();
  }

  const [beforeHash] = rest.split("#", 1);
  const queryStart = beforeHash.indexOf("?");
  const path = queryStart === -1 ? beforeHash : beforeHash.slice(0, queryStart);
  const rawQuery = queryStart === -1 ? "" : beforeHash.slice(queryStart + 1);

  return { scheme, host, path, rawQuery, params: parseQuery(rawQuery) };
}

export function parseQuery(rawQuery: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!rawQuery) return params;

  for (const pair of rawQuery.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    // First occurrence wins, matching how maps apps read their own links.
    const decodedKey = decodeComponent(key).toLowerCase();
    if (!params.has(decodedKey)) params.set(decodedKey, decodeComponent(value));
  }
  return params;
}

/** Percent-decodes a query component, treating `+` as a space. */
export function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}
