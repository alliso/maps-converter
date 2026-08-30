import { Linking } from "react-native";

import { canOpen, openPlaceIn } from "../openInApp";
import type { Place } from "../maps/types";

jest.mock("react-native", () => ({
  Linking: { canOpenURL: jest.fn(), openURL: jest.fn() },
}));

const canOpenURL = Linking.canOpenURL as jest.MockedFunction<typeof Linking.canOpenURL>;
const openURL = Linking.openURL as jest.MockedFunction<typeof Linking.openURL>;

const pin: Place = {
  coordinates: { latitude: 40.416944, longitude: -3.703333 },
  label: "Puerta del Sol",
};

beforeEach(() => {
  canOpenURL.mockReset();
  openURL.mockReset();
  openURL.mockResolvedValue(undefined as never);
});

describe("openPlaceIn", () => {
  it("uses the deep link when the app is installed", async () => {
    canOpenURL.mockResolvedValue(true);

    expect(await openPlaceIn("google", pin)).toBe("app");
    expect(openURL).toHaveBeenCalledWith("comgooglemaps://?q=40.416944%2C-3.703333&zoom=16");
  });

  it("falls back to the website when the app is not installed", async () => {
    canOpenURL.mockResolvedValue(false);

    expect(await openPlaceIn("google", pin)).toBe("web");
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(
      "https://www.google.com/maps/search/?api=1&query=40.416944%2C-3.703333",
    );
  });

  it("falls back to the website when the deep link is claimed but fails to open", async () => {
    canOpenURL.mockResolvedValue(true);
    openURL.mockRejectedValueOnce(new Error("no handler")).mockResolvedValueOnce(undefined as never);

    expect(await openPlaceIn("waze", pin)).toBe("web");
    expect(openURL).toHaveBeenNthCalledWith(1, "waze://?ll=40.416944%2C-3.703333&navigate=yes");
    expect(openURL).toHaveBeenNthCalledWith(2, "https://waze.com/ul?ll=40.416944%2C-3.703333&navigate=yes");
  });

  it("reports failure when neither the app nor the browser opens", async () => {
    canOpenURL.mockResolvedValue(false);
    openURL.mockRejectedValue(new Error("nothing can open this"));

    expect(await openPlaceIn("apple", pin)).toBe("failed");
  });

  it("passes the navigate option through to the URL builder", async () => {
    canOpenURL.mockResolvedValue(true);

    await openPlaceIn("apple", pin, { navigate: true });
    expect(openURL).toHaveBeenCalledWith("maps://?daddr=40.416944%2C-3.703333&dirflg=d");
  });
});

describe("canOpen", () => {
  it("answers what Linking says", async () => {
    canOpenURL.mockResolvedValue(true);
    expect(await canOpen("maps://")).toBe(true);
  });

  it("treats a rejected check as not installed", async () => {
    // iOS throws for a scheme missing from LSApplicationQueriesSchemes.
    canOpenURL.mockRejectedValue(new Error("scheme not declared"));
    expect(await canOpen("waze://")).toBe(false);
  });
});
