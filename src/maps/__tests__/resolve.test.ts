import { expandShortLink, resolveSharedContent } from "../resolve";

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

  it("asks as a phone, which is what maps.app.goo.gl answers with a redirect", async () => {
    // Recorded from a real shared link: a desktop User-Agent gets Firebase's
    // interstitial and no redirect at all, so only the phone request expands.
    const ADDRESS_URL =
      "https://maps.google.com/maps?q=La+mar+de+bolas,+Calle+l'Alcora,+3,+12593+Moncofa,+Castell%C3%B3&ftid=0xd601abb1acaedfb:0x4fa7493109756f75&entry=gps";
    const SHORT_URL = "https://maps.app.goo.gl/JgRjpVmxqJLK7yCY8";
    const userAgent = (init?: RequestInit) =>
      String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "");
    const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => ({
      url: /iPhone/.test(userAgent(init)) ? ADDRESS_URL : SHORT_URL,
      text: async () => "<html>interstitial with no link in it</html>",
    })) as unknown as typeof fetch;

    const result = await resolveSharedContent(SHORT_URL, { fetchImpl, skipGeocoding: true });

    expect(result.ok).toBe(true);
    expect(result.ok && result.place.query).toBe(
      "La mar de bolas, Calle l'Alcora, 3, 12593 Moncofa, Castelló",
    );
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

describe("expansions that lead nowhere", () => {
  it("gives up when the short link expands to something that is not a place", async () => {
    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: fakeFetch({ url: "https://example.com/article" }),
    });

    expect(result).toEqual({
      ok: false,
      reason: "unsupported",
      url: "https://example.com/article",
    });
  });

  it("gives up when the interstitial body cannot even be read", async () => {
    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: fakeFetch({
        url: "https://maps.app.goo.gl/abc123",
        text: async () => {
          throw new Error("connection reset");
        },
      }),
    });

    expect(result.ok).toBe(false);
  });
});

describe("expandShortLink", () => {
  it("returns the URL the redirect chain ended on", async () => {
    expect(
      await expandShortLink("https://maps.app.goo.gl/abc123", {
        fetchImpl: fakeFetch({ url: LONG_URL }),
      }),
    ).toBe(LONG_URL);
  });

  it("returns undefined when nothing redirects and the page names no target", async () => {
    expect(
      await expandShortLink("https://maps.app.goo.gl/abc123", {
        fetchImpl: fakeFetch({
          url: "https://maps.app.goo.gl/abc123",
          text: async () => "<html>nada</html>",
        }),
      }),
    ).toBeUndefined();
  });

  it("gives up rather than hanging when the request times out", async () => {
    const hangs = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    expect(
      await expandShortLink("https://maps.app.goo.gl/abc123", { fetchImpl: hangs, timeoutMs: 1 }),
    ).toBeUndefined();
  });
});

describe("what survives the expansion", () => {
  it("keeps the name from the message when the expanded link has none", async () => {
    const result = await resolveSharedContent(
      "Puerta del Sol\nhttps://maps.app.goo.gl/abc123",
      { fetchImpl: fakeFetch({ url: "https://www.google.com/maps/@40.416944,-3.703333,17z" }) },
    );

    expect(result.ok && result.place.label).toBe("Puerta del Sol");
    expect(result.ok && result.place.coordinates?.latitude).toBeCloseTo(40.416944, 5);
  });

  it("reads the interstitial even when the response reports no URL at all", async () => {
    const result = await resolveSharedContent("https://maps.app.goo.gl/abc123", {
      fetchImpl: fakeFetch({ text: async () => `<html><a href="${LONG_URL}">ir</a></html>` }),
    });

    expect(result.ok && result.place.coordinates?.latitude).toBeCloseTo(40.416944, 5);
  });
});
