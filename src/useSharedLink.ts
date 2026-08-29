import { useEffect } from "react";
import { Linking } from "react-native";

import { parseShareDeepLink } from "./shareLink";

/**
 * Calls `onShare` with whatever was shared, both when the share extension opens
 * the app cold and when it hands over a link to an app that is already running.
 */
export function useSharedLink(onShare: (text: string) => void): void {
  useEffect(() => {
    let cancelled = false;

    Linking.getInitialURL().then((url) => {
      const text = parseShareDeepLink(url);
      if (!cancelled && text) onShare(text);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      const text = parseShareDeepLink(url);
      if (text) onShare(text);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [onShare]);
}
