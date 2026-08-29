import { Linking } from "react-native";

import { buildTargetUrls, type OpenOptions } from "./maps/apps";
import type { MapAppId, Place } from "./maps/types";

export type OpenOutcome = "app" | "web" | "failed";

/**
 * Opens `place` in `app`, falling back to the website when the app is not
 * installed. `canOpenURL` needs the scheme declared in `LSApplicationQueriesSchemes`.
 */
export async function openPlaceIn(
  app: MapAppId,
  place: Place,
  options: OpenOptions = {},
): Promise<OpenOutcome> {
  const urls = buildTargetUrls(app, place, options);

  if (await canOpen(urls.app)) {
    try {
      await Linking.openURL(urls.app);
      return "app";
    } catch {
      // Fall through to the browser rather than leaving the user stuck.
    }
  }

  try {
    await Linking.openURL(urls.web);
    return "web";
  } catch {
    return "failed";
  }
}

export async function canOpen(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}
