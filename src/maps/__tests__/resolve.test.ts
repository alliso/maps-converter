import { resolveSharedContent } from "../resolve";

const LONG_URL =
  "https://www.google.com/maps/place/Puerta+del+Sol/@40.416944,-3.703333,17z/data=!4m6!3m5!8m2!3d40.416944!4d-3.703333";

function fakeFetch(response: Partial<Response>): typeof fetch {
  return jest.fn(async () => ({
    url: "",
    text: async () => "",
    ...response,
  })) as unknown as typeof fetch;
}

describe("resolveSharedContent", () => {
  it("expands a short link through the redirect chain", async () => {
    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: fakeFetch({ url: LONG_URL }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.place.coordinates?.latitude).toBeCloseTo(40.416944, 5);
    // The link the user shared is what we keep showing.
    expect(result.place.sourceUrl).toBe("https://maps.app.goo.gl/abc123");
  });

  it("digs the target out of the interstitial page when there is no redirect", async () => {
    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: fakeFetch({
        url: "https://maps.app.goo.gl/abc123",
        text: async () => `<html><a href="${LONG_URL}">continue</a></html>`,
      }),
    });

    expect(result.ok && result.place.coordinates?.longitude).toBeCloseTo(-3.703333, 5);
  });

  it("reports the link as unsupported when the network fails", async () => {
    const failing = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: failing,
    });
    expect(result).toEqual({
      ok: false,
      reason: "unsupported",
      url: "https://maps.app.goo.gl/abc123",
    });
  });

  it("does not touch the network for links that already have coordinates", async () => {
    const fetchImpl = fakeFetch({ url: LONG_URL });
    const result = await resolveSharedContent("https://waze.com/ul?ll=40.4,-3.7", { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe("share.google expansion", () => {
  const SEARCH_URL =
    "https://www.google.com/search?q=mapa+de+Prta+del+Sol,+Centro,+Madrid&shem=epsd1&source=sh/x/loc/geo/m1/3";

  it("falls back to the search term when the short link lands on a search page", async () => {
    const result = await resolveSharedContent("https://share.google/uCyPgBddGbZ6MoI3o", {
      fetchImpl: fakeFetch({ url: SEARCH_URL }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.place.query).toBe("Prta del Sol, Centro, Madrid");
    expect(result.place.sourceUrl).toBe("https://share.google/uCyPgBddGbZ6MoI3o");
  });
});

describe("when the network is unavailable", () => {
  const offline = (() =>
    jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch)();

  it("searches for the name the sharing app wrote above the link", async () => {
    const result = await resolveSharedContent(
      "Prta del Sol\nhttps://share.google/uCyPgBddGbZ6MoI3o",
      { fetchImpl: offline },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.place.query).toBe("Prta del Sol");
    expect(result.ok && result.place.coordinates).toBeUndefined();
  });

  it("still gives up when the link came with no name", async () => {
    const result = await resolveSharedContent("https://share.google/uCyPgBddGbZ6MoI3o", {
      fetchImpl: offline,
    });
    expect(result.ok).toBe(false);
  });
});

describe("geocoding a place we only know by name", () => {
  const SEARCH_URL =
    "https://www.google.com/search?q=Chocolater%C3%ADa+San+Gin%C3%A9s&source=sh/x/loc/uni/m1/3";

  const geocodeImpl = jest.fn(async () => ({
    coordinates: { latitude: 40.4152, longitude: -3.7076 },
    address: "Chocolatería San Ginés, Centro, Madrid, España",
  }));

  beforeEach(() => geocodeImpl.mockClear());

  it("turns the search term into an exact pin", async () => {
    const result = await resolveSharedContent("https://share.google/uZheGxwwfYhojopsC", {
      fetchImpl: fakeFetch({ url: SEARCH_URL }),
      geocodeImpl,
    });

    expect(geocodeImpl).toHaveBeenCalledWith("Chocolatería San Ginés", expect.anything());
    expect(result.ok && result.place.coordinates?.latitude).toBeCloseTo(40.4152, 4);
    expect(result.ok && result.place.address).toContain("Madrid");
  });

  it("leaves places that already have coordinates alone", async () => {
    const result = await resolveSharedContent("https://waze.com/ul?ll=40.4,-3.7", { geocodeImpl });

    expect(geocodeImpl).not.toHaveBeenCalled();
    expect(result.ok && result.place.address).toBeUndefined();
  });

  it("falls back to a plain search when the geocoder finds nothing", async () => {
    const result = await resolveSharedContent("Calle Mayor 1, Madrid", {
      geocodeImpl: jest.fn(async () => undefined),
    });

    expect(result.ok && result.place.coordinates).toBeUndefined();
    expect(result.ok && result.place.query).toBe("Calle Mayor 1, Madrid");
  });

  it("can be turned off", async () => {
    const result = await resolveSharedContent("Calle Mayor 1, Madrid", {
      skipGeocoding: true,
      geocodeImpl,
    });

    expect(geocodeImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
