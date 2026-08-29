import type { Coordinates } from "./types";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Decodes a geohash to the centre of its cell. Waze's short share links
 * (`waze.com/ul/h<geohash>`) use this encoding, so decoding locally saves a
 * network round trip.
 */
export function decodeGeohash(hash: string): Coordinates | undefined {
  const value = hash.toLowerCase();
  if (!value || !/^[0-9bcdefghjkmnpqrstuvwxyz]+$/.test(value)) return undefined;

  const latRange = [-90, 90];
  const lonRange = [-180, 180];
  let isLongitude = true;

  for (const char of value) {
    const index = BASE32.indexOf(char);
    if (index === -1) return undefined;

    for (let bit = 4; bit >= 0; bit--) {
      const isHigh = (index >> bit) & 1;
      const range = isLongitude ? lonRange : latRange;
      const middle = (range[0] + range[1]) / 2;
      if (isHigh) range[0] = middle;
      else range[1] = middle;
      isLongitude = !isLongitude;
    }
  }

  return {
    latitude: round((latRange[0] + latRange[1]) / 2),
    longitude: round((lonRange[0] + lonRange[1]) / 2),
  };
}

const round = (value: number) => Number.parseFloat(value.toFixed(6));
