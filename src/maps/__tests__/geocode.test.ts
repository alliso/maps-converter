import { geocode } from "../geocode";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return jest.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

const NOMINATIM_HIT = [
  {
    lat: "40.4167047",
    lon: "-3.7035825",
    display_name: "Puerta del Sol, Centro, Madrid, España",
  },
];

describe("geocode", () => {
  it("turns a name into coordinates and a readable address", async () => {
    const result = await geocode("Puerta del Sol", { fetchImpl: fakeFetch(NOMINATIM_HIT) });

    expect(result?.coordinates.latitude).toBeCloseTo(40.4167047, 5);
    expect(result?.coordinates.longitude).toBeCloseTo(-3.7035825, 5);
    expect(result?.address).toContain("Madrid");
  });

  it("gives up quietly on an empty result, an error or a bad payload", async () => {
    expect(await geocode("nowhere", { fetchImpl: fakeFetch([]) })).toBeUndefined();
    expect(await geocode("nowhere", { fetchImpl: fakeFetch(NOMINATIM_HIT, false) })).toBeUndefined();
    expect(
      await geocode("nowhere", { fetchImpl: fakeFetch([{ lat: "x", lon: "y" }]) }),
    ).toBeUndefined();
    expect(await geocode("   ", { fetchImpl: fakeFetch(NOMINATIM_HIT) })).toBeUndefined();
  });
});

describe("geocode request details", () => {
  it("asks Nominatim for one result, in the language it is given", async () => {
    const fetchImpl = fakeFetch(NOMINATIM_HIT);

    await geocode("Puerta del Sol", { fetchImpl, language: "es-ES" });

    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toContain("limit=1");
    expect(url).toContain("q=Puerta%20del%20Sol");
    expect((init.headers as Record<string, string>)["Accept-Language"]).toBe("es-ES");
  });

  it("leaves the language header out when none is asked for", async () => {
    const fetchImpl = fakeFetch(NOMINATIM_HIT);

    await geocode("Puerta del Sol", { fetchImpl });

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(init.headers).not.toHaveProperty("Accept-Language");
  });

  it("accepts a match with no display name and reports an empty address", async () => {
    const result = await geocode("Sol", {
      fetchImpl: fakeFetch([{ lat: "40.4", lon: "-3.7" }]),
    });

    expect(result?.address).toBe("");
  });

  it("gives up rather than hanging when the request times out", async () => {
    const hangs = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    expect(await geocode("Sol", { fetchImpl: hangs, timeoutMs: 1 })).toBeUndefined();
  });
});
