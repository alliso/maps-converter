import { decodeComponent, extractUrl, parseQuery, parseUrl } from "../url";

describe("extractUrl", () => {
  it("finds a link inside a sentence", () => {
    expect(extractUrl("Nos vemos en https://waze.com/ul?ll=40.4,-3.7 a las 8")).toBe(
      "https://waze.com/ul?ll=40.4,-3.7",
    );
  });

  it("recognises the app schemes as well as http", () => {
    expect(extractUrl("maps://?ll=40.4,-3.7")).toBe("maps://?ll=40.4,-3.7");
    expect(extractUrl("comgooglemaps://?q=Sol")).toBe("comgooglemaps://?q=Sol");
    expect(extractUrl("waze://?ll=40.4,-3.7")).toBe("waze://?ll=40.4,-3.7");
    expect(extractUrl("geo:40.4,-3.7")).toBe("geo:40.4,-3.7");
  });

  it("drops the punctuation that ends the sentence, not the URL", () => {
    expect(extractUrl("Vamos a https://waze.com/ul?ll=40.4,-3.7.")).toBe(
      "https://waze.com/ul?ll=40.4,-3.7",
    );
    expect(extractUrl("https://example.com/a;")).toBe("https://example.com/a");
    expect(extractUrl("https://example.com/a:")).toBe("https://example.com/a");
  });

  it("drops a bracket only when it has no opening partner", () => {
    expect(extractUrl("(mira https://maps.google.com/?q=40.4,-3.7)")).toBe(
      "https://maps.google.com/?q=40.4,-3.7",
    );
    expect(extractUrl("[https://example.com/a]")).toBe("https://example.com/a");
    // The label of a geo: URI is part of the link and has to survive.
    expect(extractUrl("geo:0,0?q=40.4,-3.7(Home)")).toBe("geo:0,0?q=40.4,-3.7(Home)");
  });

  it("returns undefined when there is no link", () => {
    expect(extractUrl("no hay enlaces aquí")).toBeUndefined();
    expect(extractUrl("")).toBeUndefined();
  });
});

describe("parseUrl", () => {
  it("splits scheme, host, path and query", () => {
    expect(parseUrl("https://www.google.com/maps/place/Sol?q=40.4,-3.7&z=17")).toEqual({
      scheme: "https",
      host: "www.google.com",
      path: "/maps/place/Sol",
      rawQuery: "q=40.4,-3.7&z=17",
      params: new Map([
        ["q", "40.4,-3.7"],
        ["z", "17"],
      ]),
    });
  });

  it("lowercases the scheme and host, and drops userinfo, port and fragment", () => {
    expect(parseUrl("HTTPS://user:pw@MAPS.Google.COM:8443/maps/place/X?A=1#frag")).toEqual({
      scheme: "https",
      host: "maps.google.com",
      path: "/maps/place/X",
      rawQuery: "A=1",
      params: new Map([["a", "1"]]),
    });
  });

  it("handles scheme-only URLs with no authority", () => {
    expect(parseUrl("geo:40.4,-3.7")).toMatchObject({
      scheme: "geo",
      host: "",
      path: "40.4,-3.7",
    });
  });

  it("keeps percent escapes in the path so the caller decides when to decode", () => {
    expect(parseUrl("https://maps.google.com/maps/place/Puerta%20del%20Sol")?.path).toBe(
      "/maps/place/Puerta%20del%20Sol",
    );
  });

  it("copes with a host and nothing else", () => {
    expect(parseUrl("https://maps.app.goo.gl")).toMatchObject({
      host: "maps.app.goo.gl",
      path: "",
      rawQuery: "",
    });
  });

  it("rejects anything that is not a URL", () => {
    expect(parseUrl("no-scheme")).toBeUndefined();
    expect(parseUrl(":empty")).toBeUndefined();
    expect(parseUrl("1nvalid:x")).toBeUndefined();
    expect(parseUrl("")).toBeUndefined();
  });
});

describe("parseQuery", () => {
  it("decodes values and lowercases keys", () => {
    expect(parseQuery("Q=Puerta%20del%20Sol")).toEqual(new Map([["q", "Puerta del Sol"]]));
  });

  it("keeps the first occurrence of a repeated key", () => {
    expect(parseQuery("q=a&q=b").get("q")).toBe("a");
  });

  it("gives a valueless key an empty string and skips empty pairs", () => {
    expect([...parseQuery("flag&&x=1").entries()]).toEqual([
      ["flag", ""],
      ["x", "1"],
    ]);
  });

  it("returns an empty map for an empty query", () => {
    expect(parseQuery("").size).toBe(0);
  });
});

describe("decodeComponent", () => {
  it("treats + as a space", () => {
    expect(decodeComponent("Puerta+del+Sol")).toBe("Puerta del Sol");
  });

  it("returns the raw value when the escapes are malformed", () => {
    expect(decodeComponent("100%+de+a%E0%A4%A")).toBe("100% de a%E0%A4%A");
  });
});
