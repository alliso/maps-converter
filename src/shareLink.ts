import { parseUrl } from "./maps/url";

/** Host of the deep link the share extension opens: `<scheme>://share?text=…`. */
const SHARE_HOST = "share";

/**
 * Reads the payload the share extension put in the deep link. Returns undefined
 * for any other link, so ordinary deep links fall through untouched.
 */
export function parseShareDeepLink(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const parsed = parseUrl(url);
  if (!parsed || parsed.host !== SHARE_HOST) return undefined;

  const text = parsed.params.get("text")?.trim();
  return text ? text : undefined;
}
