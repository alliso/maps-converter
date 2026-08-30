import {
  findCoordinates,
  formatCoordinates,
  isValidCoordinates,
  parseCoordinates,
} from "../coordinates";

describe("isValidCoordinates", () => {
  it("accepts a point on Earth, including the poles and the antimeridian", () => {
    expect(isValidCoordinates({ latitude: 40.4, longitude: -3.7 })).toBe(true);
    expect(isValidCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(isValidCoordinates({ latitude: 90.1, longitude: 0 })).toBe(false);
    expect(isValidCoordinates({ latitude: 0, longitude: 180.1 })).toBe(false);
    expect(isValidCoordinates({ latitude: Number.NaN, longitude: 0 })).toBe(false);
    expect(isValidCoordinates({ latitude: 0, longitude: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("parseCoordinates", () => {
  it("reads a pair with either separator and any surrounding space", () => {
    expect(parseCoordinates("40.416944,-3.703333")).toEqual({
      latitude: 40.416944,
      longitude: -3.703333,
    });
    expect(parseCoordinates("  40.4 ; -3.7  ")).toEqual({ latitude: 40.4, longitude: -3.7 });
    expect(parseCoordinates("+40.4, -3.7")).toEqual({ latitude: 40.4, longitude: -3.7 });
  });

  it("requires the whole string to be the pair", () => {
    expect(parseCoordinates("aquí 40.4,-3.7")).toBeUndefined();
    expect(parseCoordinates("40.4,-3.7 aquí")).toBeUndefined();
  });

  it("rejects a pair that is not a point on Earth", () => {
    expect(parseCoordinates("91,0")).toBeUndefined();
    expect(parseCoordinates("40,181")).toBeUndefined();
  });

  it("returns undefined for nothing at all", () => {
    expect(parseCoordinates(undefined)).toBeUndefined();
    expect(parseCoordinates("")).toBeUndefined();
    expect(parseCoordinates("Puerta del Sol")).toBeUndefined();
  });
});

describe("findCoordinates", () => {
  it("picks the pair out of a message", () => {
    expect(findCoordinates("estoy en 40.416944, -3.703333 ahora")).toEqual({
      latitude: 40.416944,
      longitude: -3.703333,
    });
  });

  it("returns undefined when the message has no pair", () => {
    expect(findCoordinates("nos vemos en la plaza")).toBeUndefined();
  });
});

describe("formatCoordinates", () => {
  it("writes the lat,lon form every maps app accepts", () => {
    expect(formatCoordinates({ latitude: 40.416944, longitude: -3.703333 })).toBe(
      "40.416944,-3.703333",
    );
  });

  it("trims the noise past ~1cm of precision", () => {
    expect(formatCoordinates({ latitude: 40.4169444444444, longitude: -3.7033333333 })).toBe(
      "40.4169444,-3.7033333",
    );
    expect(formatCoordinates({ latitude: 40.41694400001, longitude: -3.7 })).toBe("40.416944,-3.7");
  });
});
