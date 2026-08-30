import * as maps from "..";

/**
 * The barrel is what the UI imports from, so a re-export dropped by accident
 * should fail here rather than at build time.
 */
describe("the maps barrel", () => {
  it("exposes the parsing, resolving and opening entry points", () => {
    expect(Object.keys(maps).sort()).toEqual([
      "MAP_APPS",
      "buildTargetUrls",
      "expandShortLink",
      "findCoordinates",
      "formatCoordinates",
      "identifySource",
      "isShortLink",
      "isValidCoordinates",
      "parseCoordinates",
      "parseGoogleSearch",
      "parseMapUrl",
      "parseSharedContent",
      "resolveSharedContent",
    ].sort());
  });
});
