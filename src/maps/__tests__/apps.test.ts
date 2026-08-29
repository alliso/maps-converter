import { buildTargetUrls } from "../apps";
import type { Place } from "../types";

const pin: Place = {
  coordinates: { latitude: 40.416944, longitude: -3.703333 },
  label: "Puerta del Sol",
};
const search: Place = { query: "Calle Mayor 1, Madrid" };

describe("buildTargetUrls", () => {
  it("drops a labelled pin in Apple Maps", () => {
    const urls = buildTargetUrls("apple", pin);
    expect(urls.app).toBe("maps://?ll=40.416944%2C-3.703333&q=Puerta%20del%20Sol");
    expect(urls.web).toContain("https://maps.apple.com/?ll=");
  });

  it("searches in Apple Maps when there are no coordinates", () => {
    expect(buildTargetUrls("apple", search).app).toBe(
      "maps://?q=Calle%20Mayor%201%2C%20Madrid",
    );
  });

  it("opens Google Maps with the app scheme and a web fallback", () => {
    const urls = buildTargetUrls("google", pin);
    expect(urls.app).toBe("comgooglemaps://?q=40.416944%2C-3.703333&zoom=16");
    expect(urls.web).toBe(
      "https://www.google.com/maps/search/?api=1&query=40.416944%2C-3.703333",
    );
  });

  it("always navigates in Waze", () => {
    const urls = buildTargetUrls("waze", pin);
    expect(urls.app).toBe("waze://?ll=40.416944%2C-3.703333&navigate=yes");
    expect(urls.web).toBe("https://waze.com/ul?ll=40.416944%2C-3.703333&navigate=yes");
  });

  it("builds directions when navigate is requested", () => {
    expect(buildTargetUrls("apple", pin, { navigate: true }).app).toBe(
      "maps://?daddr=40.416944%2C-3.703333&dirflg=d",
    );
    expect(buildTargetUrls("google", pin, { navigate: true }).web).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=40.416944%2C-3.703333",
    );
  });

  it("prefers coordinates over the search term", () => {
    const both: Place = { ...pin, query: "Puerta del Sol" };
    expect(buildTargetUrls("google", both).app).toContain("40.416944");
  });
});
