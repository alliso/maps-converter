import { formatCoordinates } from "./coordinates";
import type { MapAppId, Place } from "./types";

export type MapApp = {
  id: MapAppId;
  name: string;
  /** URL scheme used to check whether the app is installed. */
  scheme: string;
  /** Emoji shown in the list until there are real icons. */
  symbol: string;
};

export const MAP_APPS: MapApp[] = [
  { id: "apple", name: "Apple Maps", scheme: "maps://", symbol: "🍎" },
  { id: "google", name: "Google Maps", scheme: "comgooglemaps://", symbol: "🗺️" },
  { id: "waze", name: "Waze", scheme: "waze://", symbol: "🚗" },
];

export type OpenOptions = {
  /** Start turn-by-turn navigation instead of just showing the place. */
  navigate?: boolean;
};

export type TargetUrls = {
  /** Deep link into the installed app. */
  app: string;
  /** Browser URL, used when the app is not installed. */
  web: string;
};

/**
 * Builds the deep link and the web fallback that open `place` in `app`.
 * Coordinates win over the search term whenever we have them, because a pin is
 * exact and a search is a guess.
 */
export function buildTargetUrls(
  app: MapAppId,
  place: Place,
  options: OpenOptions = {},
): TargetUrls {
  const target = place.coordinates
    ? formatCoordinates(place.coordinates)
    : (place.query ?? "");
  const label = place.label ?? target;

  switch (app) {
    case "apple":
      return options.navigate
        ? {
            app: `maps://?daddr=${enc(target)}&dirflg=d`,
            web: `https://maps.apple.com/?daddr=${enc(target)}&dirflg=d`,
          }
        : {
            app: `maps://?${appleQuery(place, target, label)}`,
            web: `https://maps.apple.com/?${appleQuery(place, target, label)}`,
          };

    case "google":
      return options.navigate
        ? {
            app: `comgooglemaps://?daddr=${enc(target)}&directionsmode=driving`,
            web: `https://www.google.com/maps/dir/?api=1&destination=${enc(target)}`,
          }
        : {
            app: `comgooglemaps://?q=${enc(target)}&zoom=16`,
            web: `https://www.google.com/maps/search/?api=1&query=${enc(target)}`,
          };

    case "waze": {
      // Waze has no "just show it" mode worth using: it is a driving app.
      const query = place.coordinates
        ? `ll=${enc(target)}&navigate=yes`
        : `q=${enc(target)}&navigate=yes`;
      return { app: `waze://?${query}`, web: `https://waze.com/ul?${query}` };
    }
  }
}

/** Apple needs `q` for the pin label and `ll` for the exact spot. */
function appleQuery(place: Place, target: string, label: string): string {
  if (!place.coordinates) return `q=${enc(target)}`;
  return `ll=${enc(target)}&q=${enc(label)}`;
}

const enc = encodeURIComponent;
