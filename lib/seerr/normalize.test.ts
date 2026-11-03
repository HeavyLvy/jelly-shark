import { describe, expect, it } from "vitest";
import { mapMediaStatus, normalizeDetail, normalizeItem, normalizeSeasons, safePosterPath } from "./normalize";

describe("mapMediaStatus", () => {
  it.each([
    [2, "pending"],
    [3, "processing"],
    [4, "partial"],
    [5, "available"],
    [1, "none"],
    [6, "none"],
    [undefined, "none"],
  ])("%s is %s", (n, expected) => expect(mapMediaStatus(n)).toBe(expected));
});

describe("safePosterPath", () => {
  it("only lets plain TMDB file names through", () => {
    expect(safePosterPath("/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg")).toBe("/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg");
    for (const bad of ["../../etc/passwd", "/a/b.jpg", "/x.jpg?y=1", "http://evil.test/x.jpg", "/x.svg", "", null, 5]) expect(safePosterPath(bad)).toBeNull();
  });
});

describe("normalizeItem", () => {
  it("reads a movie result and keeps only what the app needs", () => {
    const item = normalizeItem({ id: 603, mediaType: "movie", title: "Lantern Harbor", releaseDate: "1999-03-31", overview: "A harbor.", posterPath: "/p.jpg", mediaInfo: { status: 2, ratingKey: "secret" }, adult: false });
    expect(item).toEqual({ id: 603, mediaType: "movie", title: "Lantern Harbor", year: "1999", overview: "A harbor.", posterPath: "/p.jpg", status: "pending" });
  });
  it("reads a show result", () => {
    expect(normalizeItem({ id: 7, mediaType: "tv", name: "Night Ferry", firstAirDate: "2008-01-20", posterPath: null })).toMatchObject({ title: "Night Ferry", year: "2008", status: "none", posterPath: null });
  });
  it.each([["a person", { id: 1, mediaType: "person", name: "A. Person" }], ["no title", { id: 1, mediaType: "movie" }], ["a bad id", { id: -4, mediaType: "movie", title: "x" }], ["not an object", "x"]])("skips %s", (_l, raw) => {
    expect(normalizeItem(raw)).toBeNull();
  });
});

describe("normalizeSeasons", () => {
  const show = (mediaInfo?: unknown) => ({
    seasons: [
      { seasonNumber: 0, name: "Specials", episodeCount: 3 },
      { seasonNumber: 2, name: "Season 2", episodeCount: 8 },
      { seasonNumber: 1, name: "Season 1", episodeCount: 7 },
      { seasonNumber: 3, episodeCount: 5 },
    ],
    mediaInfo,
  });
  it("lists seasons in order without Specials, all open when nothing is known", () => {
    expect(normalizeSeasons(show()).map((s) => [s.number, s.status])).toEqual([[1, "none"], [2, "none"], [3, "none"]]);
    expect(normalizeSeasons(show())[2].name).toBe("Season 3");
  });
  it("marks requested and available seasons, ignoring declined requests", () => {
    const seasons = normalizeSeasons(
      show({
        seasons: [{ seasonNumber: 2, status: 5 }],
        requests: [
          { status: 1, seasons: [{ seasonNumber: 1 }] },
          { status: 3, seasons: [{ seasonNumber: 3 }] },
        ],
      }),
    );
    expect(seasons.map((s) => [s.number, s.status])).toEqual([[1, "pending"], [2, "available"], [3, "none"]]);
  });
  it("shows an approved request as processing, and never downgrades available", () => {
    const seasons = normalizeSeasons(show({ seasons: [{ seasonNumber: 1, status: 5 }], requests: [{ status: 2, seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }] }] }));
    expect(seasons.map((s) => s.status)).toEqual(["available", "processing", "none"]);
  });
});

describe("normalizeDetail", () => {
  it("gives a movie no seasons and a show its seasons", () => {
    expect(normalizeDetail({ id: 1, title: "M", seasons: [{ seasonNumber: 1 }] }, "movie")?.seasons).toEqual([]);
    expect(normalizeDetail({ id: 2, name: "S", seasons: [{ seasonNumber: 1, episodeCount: 2 }] }, "tv")?.seasons).toHaveLength(1);
    expect(normalizeDetail(null, "tv")).toBeNull();
  });
});
