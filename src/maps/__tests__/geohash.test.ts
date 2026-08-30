import { decodeGeohash } from "../geohash";

describe("decodeGeohash", () => {
  it("decodes a Waze short link hash to the centre of its cell", () => {
    const coordinates = decodeGeohash("ezjmgtxmf");
    expect(coordinates?.latitude).toBeCloseTo(40.416944, 3);
    expect(coordinates?.longitude).toBeCloseTo(-3.703333, 3);
  });

  it("is case insensitive", () => {
    expect(decodeGeohash("EZJMGTXMF")).toEqual(decodeGeohash("ezjmgtxmf"));
  });

  it("gets coarser as the hash gets shorter, but stays in the neighbourhood", () => {
    const coarse = decodeGeohash("ezjm");
    expect(coarse?.latitude).toBeCloseTo(40.4, 0);
    expect(coarse?.longitude).toBeCloseTo(-3.7, 0);
  });

  it("rejects an empty hash and the letters base32 leaves out", () => {
    expect(decodeGeohash("")).toBeUndefined();
    // a, i, l and o are excluded to avoid mistaking them for other characters.
    expect(decodeGeohash("ezja")).toBeUndefined();
    expect(decodeGeohash("ezji")).toBeUndefined();
    expect(decodeGeohash("ezjl")).toBeUndefined();
    expect(decodeGeohash("ezjo")).toBeUndefined();
    expect(decodeGeohash("ez-jm")).toBeUndefined();
  });
});
