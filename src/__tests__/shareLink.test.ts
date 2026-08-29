import { parseShareDeepLink } from "../shareLink";

describe("parseShareDeepLink", () => {
  it("reads the payload the share extension encodes", () => {
    const shared =
      "Puerta del Sol\nhttps://www.google.com/maps/place/Puerta+del+Sol/@40.4,-3.7,17z/data=!3d40.416944!4d-3.703333";
    const link = `mapsconverter://share?text=${encodeURIComponent(shared)}`;

    expect(parseShareDeepLink(link)).toBe(shared);
  });

  it("survives the ? & # of the shared link itself", () => {
    const shared = "https://maps.google.com/?q=40.4,-3.7&z=17#map";
    expect(parseShareDeepLink(`mapsconverter://share?text=${encodeURIComponent(shared)}`)).toBe(
      shared,
    );
  });

  it("keeps a literal + instead of turning it into a space", () => {
    const shared = "https://www.google.com/maps/place/Puerta+del+Sol";
    expect(parseShareDeepLink(`mapsconverter://share?text=${encodeURIComponent(shared)}`)).toBe(
      shared,
    );
  });

  it("ignores links that are not a share", () => {
    expect(parseShareDeepLink("mapsconverter://settings")).toBeUndefined();
    expect(parseShareDeepLink("https://example.com/share?text=hola")).toBeUndefined();
    expect(parseShareDeepLink("mapsconverter://share?text=%20%20")).toBeUndefined();
    expect(parseShareDeepLink(null)).toBeUndefined();
  });
});
