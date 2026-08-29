import { geocode } from "../geocode";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return jest.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe("geocode", () => {
  const NOMINATIM_HIT = [
    {
      lat: "40.4167047",
      lon: "-3.7035825",
      display_name: "Puerta del Sol, Centro, Madrid, España",
    },
  ];

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
