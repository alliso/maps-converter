import { parseGoogleSearch, parseMapUrl, parseSharedContent } from "../parse";
import type { Coordinates, ParseResult } from "../types";

const SOL: Coordinates = { latitude: 40.416944, longitude: -3.703333 };

function expectPlace(result: ParseResult) {
  if (!result.ok) throw new Error(`expected a place, got ${result.reason}`);
  return result.place;
}

function expectNear(actual: Coordinates | undefined, expected: Coordinates, precision = 5) {
  expect(actual).toBeDefined();
  expect(actual!.latitude).toBeCloseTo(expected.latitude, precision);
  expect(actual!.longitude).toBeCloseTo(expected.longitude, precision);
}

describe("Google Maps links", () => {
  it("prefers the pin in data= over the camera position in @", () => {
    const place = expectPlace(
      parseSharedContent(
        "https://www.google.com/maps/place/Puerta+del+Sol/@40.4000000,-3.6000000,17z/" +
          "data=!3m1!4b1!4m6!3m5!1s0xd42287bb0d20d1f:0x8f7dbeb5cbdeed99!8m2!3d40.416944!4d-3.703333",
      ),
    );
    expectNear(place.coordinates, SOL);
    expect(place.label).toBe("Puerta del Sol");
    expect(place.source).toBe("google");
  });

  it("falls back to the camera position when there is no pin", () => {
    const place = expectPlace(
      parseSharedContent("https://www.google.com/maps/@40.416944,-3.703333,15z"),
    );
    expectNear(place.coordinates, SOL);
  });

  it("reads the universal search URL", () => {
    const place = expectPlace(
      parseSharedContent("https://www.google.com/maps/search/?api=1&query=40.416944,-3.703333"),
    );
    expectNear(place.coordinates, SOL);
    expect(place.query).toBeUndefined();
  });

  it("keeps a named search as a query", () => {
    const place = expectPlace(
      parseSharedContent("https://www.google.com/maps/search/?api=1&query=Puerta+del+Sol+Madrid"),
    );
    expect(place.coordinates).toBeUndefined();
    expect(place.query).toBe("Puerta del Sol Madrid");
  });

  it("reads the legacy maps.google.com form", () => {
    const place = expectPlace(
      parseSharedContent("https://maps.google.com/?q=40.416944,-3.703333&z=17"),
    );
    expectNear(place.coordinates, SOL);
  });

  it("reads a directions link", () => {
    const place = expectPlace(
      parseSharedContent(
        "https://www.google.com/maps/dir/?api=1&destination=40.416944,-3.703333",
      ),
    );
    expectNear(place.coordinates, SOL);
  });

  it("reads the comgooglemaps:// scheme", () => {
    const place = expectPlace(parseSharedContent("comgooglemaps://?q=40.416944,-3.703333&zoom=16"));
    expectNear(place.coordinates, SOL);
    expect(place.source).toBe("google");
  });

  it("flags the legacy goo.gl/maps short link as needing the network", () => {
    const result = parseSharedContent("https://goo.gl/maps/aBcDeF12345");
    expect(result.ok && result.needsResolution).toBe(true);
    expect(result.ok && result.place.source).toBe("google");
  });

  it("does not treat a non-maps goo.gl link as a place", () => {
    expect(parseSharedContent("https://goo.gl/aBcDeF12345")).toEqual({
      ok: false,
      reason: "unsupported",
      url: "https://goo.gl/aBcDeF12345",
    });
  });

  it("flags short links as needing the network", () => {
    const result = parseSharedContent("https://maps.app.goo.gl/aBcDeF12345");
    expect(result.ok).toBe(true);
    expect(result.ok && result.needsResolution).toBe(true);
    expect(result.ok && result.place.source).toBe("google");
  });
});

describe("Apple Maps links", () => {
  it("reads the classic ll/q form", () => {
    const place = expectPlace(
      parseSharedContent("https://maps.apple.com/?ll=40.416944,-3.703333&q=Puerta%20del%20Sol"),
    );
    expectNear(place.coordinates, SOL);
    expect(place.label).toBe("Puerta del Sol");
    expect(place.source).toBe("apple");
  });

  it("reads the newer /place form", () => {
    const place = expectPlace(
      parseSharedContent(
        "https://maps.apple.com/place?address=Plaza%20Puerta%20del%20Sol&coordinate=40.416944,-3.703333&name=Puerta%20del%20Sol&place-id=I123",
      ),
    );
    expectNear(place.coordinates, SOL);
    expect(place.label).toBe("Puerta del Sol");
  });

  it("reads the maps:// scheme with a destination address", () => {
    const place = expectPlace(parseSharedContent("maps://?daddr=Puerta+del+Sol,+Madrid"));
    expect(place.coordinates).toBeUndefined();
    expect(place.query).toBe("Puerta del Sol, Madrid");
  });
});

describe("Waze links", () => {
  it("reads /ul with coordinates", () => {
    const place = expectPlace(
      parseSharedContent("https://waze.com/ul?ll=40.416944%2C-3.703333&navigate=yes"),
    );
    expectNear(place.coordinates, SOL);
    expect(place.source).toBe("waze");
  });

  it("reads live-map directions", () => {
    const place = expectPlace(
      parseSharedContent(
        "https://www.waze.com/live-map/directions?to=ll.40.416944%2C-3.703333",
      ),
    );
    expectNear(place.coordinates, SOL);
  });

  it("reads the waze:// scheme", () => {
    const place = expectPlace(parseSharedContent("waze://?ll=40.416944,-3.703333&navigate=yes"));
    expectNear(place.coordinates, SOL);
    expect(place.source).toBe("waze");
  });

  it("decodes a geohash short link without the network", () => {
    const place = expectPlace(parseSharedContent("https://waze.com/ul/hezjmgtxmf"));
    expectNear(place.coordinates, SOL, 3);
  });
});

describe("geo: URIs and plain text", () => {
  it("reads bare coordinates", () => {
    const place = expectPlace(parseSharedContent("geo:40.416944,-3.703333"));
    expectNear(place.coordinates, SOL);
  });

  it("reads a labelled query", () => {
    const place = expectPlace(parseSharedContent("geo:0,0?q=40.416944,-3.703333(Casa)"));
    expectNear(place.coordinates, SOL);
    expect(place.label).toBe("Casa");
  });

  it("treats geo:0,0 with a name as a search", () => {
    const place = expectPlace(parseSharedContent("geo:0,0?q=Puerta+del+Sol"));
    expect(place.coordinates).toBeUndefined();
    expect(place.query).toBe("Puerta del Sol");
  });

  it("finds a link inside a message", () => {
    const place = expectPlace(
      parseSharedContent("Nos vemos aquí https://waze.com/ul?ll=40.416944,-3.703333 ¿vale?"),
    );
    expectNear(place.coordinates, SOL);
  });

  it("finds loose coordinates in a message", () => {
    const place = expectPlace(parseSharedContent("estoy en 40.416944, -3.703333"));
    expectNear(place.coordinates, SOL);
  });

  it("treats a short unknown string as an address to search", () => {
    const place = expectPlace(parseSharedContent("Calle Mayor 1, Madrid"));
    expect(place.query).toBe("Calle Mayor 1, Madrid");
  });

  it("rejects empty content", () => {
    expect(parseSharedContent("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a non-maps link", () => {
    const result = parseSharedContent("https://example.com/article");
    expect(result).toEqual({
      ok: false,
      reason: "unsupported",
      url: "https://example.com/article",
    });
  });
});

describe("labels from the shared message", () => {
  it("uses the place name that Google Maps puts above the link", () => {
    const place = expectPlace(
      parseSharedContent(
        "Puerta del Sol\nPlaza Puerta del Sol, 28013 Madrid\nhttps://maps.app.goo.gl/aBcDeF12345",
      ),
    );
    expect(place.label).toBe("Puerta del Sol");
    expect(place.source).toBe("google");
  });

  it("does not override a label the link already carries", () => {
    const place = expectPlace(
      parseSharedContent("Otra cosa\nhttps://maps.apple.com/?ll=40.4,-3.7&q=Puerta%20del%20Sol"),
    );
    expect(place.label).toBe("Puerta del Sol");
  });
});

describe("Google share.google links", () => {
  it("needs the network to expand", () => {
    const result = parseSharedContent("https://share.google/uCyPgBddGbZ6MoI3o");
    expect(result.ok && result.needsResolution).toBe(true);
    expect(result.ok && result.place.source).toBe("google");
  });

  it("reads a shared-location search and drops the 'mapa de' prefix", () => {
    const place = expectPlace(
      parseSharedContent(
        "https://www.google.com/search?q=mapa+de+Puerta+del+Sol,+Centro,+Madrid&source=sh/x/loc/geo/m1/3",
      ),
    );
    expect(place.query).toBe("Puerta del Sol, Centro, Madrid");
    expect(place.coordinates).toBeUndefined();
  });

  it("leaves an ordinary Google search alone", () => {
    const result = parseSharedContent("https://www.google.com/search?q=paella+recipe");
    expect(result.ok).toBe(false);
  });
});

describe("content we cannot turn into a place", () => {
  it("rejects a maps URL that names nowhere in particular", () => {
    expect(parseSharedContent("https://www.waze.com/live-map")).toEqual({
      ok: false,
      reason: "unsupported",
      url: "https://www.waze.com/live-map",
    });
  });

  it("rejects a geo: URI with neither coordinates nor a query", () => {
    expect(parseSharedContent("geo:sinsentido")).toEqual({
      ok: false,
      reason: "unsupported",
      url: "geo:sinsentido",
    });
  });

  it("rejects prose too long to be an address", () => {
    expect(parseSharedContent("a".repeat(251))).toEqual({ ok: false, reason: "unsupported" });
  });

  it("takes the coordinates out of a long message even when the link is unknown", () => {
    const place = expectPlace(
      parseSharedContent("mira https://example.com/x — estamos en 40.416944,-3.703333"),
    );
    expectNear(place.coordinates, SOL);
    expect(place.sourceUrl).toBe("https://example.com/x");
  });
});

describe("parseMapUrl", () => {
  it("ignores anything that is not a URL", () => {
    expect(parseMapUrl("Puerta del Sol")).toBeUndefined();
  });

  it("ignores a URL from an app we do not read", () => {
    expect(parseMapUrl("https://example.com/maps/place/Sol")).toBeUndefined();
  });
});

describe("parseGoogleSearch", () => {
  it("takes the search term as the place", () => {
    const result = parseGoogleSearch("https://www.google.com/search?q=Chocolater%C3%ADa+San+Gin%C3%A9s");
    expect(result?.ok && result.place.query).toBe("Chocolatería San Ginés");
  });

  it("declines a host that is not Google", () => {
    expect(parseGoogleSearch("https://duckduckgo.com/?q=Sol")).toBeUndefined();
  });

  it("declines a search with nothing to search for", () => {
    expect(parseGoogleSearch("https://www.google.com/search?tbm=isch")).toBeUndefined();
    // A coordinate pair is a place, not a name, and is handled elsewhere.
    expect(parseGoogleSearch("https://www.google.com/search?q=40.4,-3.7")).toBeUndefined();
  });
});
