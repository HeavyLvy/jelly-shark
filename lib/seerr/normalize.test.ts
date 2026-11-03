import { describe, expect, it } from "vitest";
import { imageFileName, mapMediaStatus, normalizeCredits, normalizeDetail, normalizeEpisodes, normalizeItem, normalizeList, normalizePerson, normalizeRequests, normalizeSeasons, safePosterPath } from "./normalize";

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

describe("imageFileName", () => {
  it("keeps just the file name, whether it came as a path or a full address", () => {
    expect(imageFileName("/abc.jpg")).toBe("/abc.jpg");
    expect(imageFileName("https://image.tmdb.org/t/p/original//ydlY3iPf.jpg")).toBe("/ydlY3iPf.jpg");
    for (const bad of [null, "", "https://evil.test/x.svg", "/a/..", 7]) expect(imageFileName(bad)).toBeNull();
  });
});

const MOVIE = {
  id: 603, title: "Lantern Harbor", releaseDate: "2019-05-03", overview: "A harbor.", posterPath: "/p.jpg", backdropPath: "/b.jpg", tagline: " Keep the light on. ",
  runtime: 136, voteAverage: 7.8, status: "Released", originalLanguage: "en", budget: 63000000, revenue: 0, homepage: "https://example.test/", genres: [{ name: "Drama" }, { name: "Mystery" }],
  productionCompanies: [{ name: "Foghorn" }], mediaInfo: { status: 5, jellyfinMediaId: "abc123", ratingKey: "secret" },
  credits: {
    cast: [{ id: 1, name: "Mara Quill", character: "Ines", profilePath: "/m.jpg" }, { id: 1, name: "Mara Quill", character: "Again" }, { id: 2, name: "Tomas Reed", character: "Gus", profilePath: "../x" }],
    crew: [{ id: 3, name: "Ila Brandt", job: "Director" }, { id: 3, name: "Ila Brandt", job: "Screenplay" }, { id: 4, name: "Sam Ono", job: "Producer" }],
  },
  releases: { results: [{ iso_3166_1: "GB", release_dates: [{ certification: "12A" }] }, { iso_3166_1: "US", release_dates: [{ certification: "" }, { certification: "PG-13" }] }] },
  relatedVideos: [{ site: "YouTube", key: "feat0000001", type: "Featurette" }, { site: "Vimeo", key: "vimeo000001", type: "Trailer" }, { site: "YouTube", key: "trail000001", type: "Trailer" }],
};

describe("normalizeDetail", () => {
  it("keeps what a movie page shows, and nothing else", () => {
    const d = normalizeDetail(MOVIE, "movie")!;
    expect(d.item).toMatchObject({ id: 603, title: "Lantern Harbor", status: "available" });
    expect(d).toMatchObject({
      tagline: "Keep the light on.", backdropPath: "/b.jpg", runtime: 136, rating: 7.8, certification: "PG-13", date: "2019-05-03", statusText: "Released",
      originalLanguage: "en", genres: ["Drama", "Mystery"], studios: ["Foghorn"], budget: 63000000, revenue: null, homepage: "https://example.test/", jellyfinId: "abc123",
      directors: ["Ila Brandt"], writers: ["Ila Brandt"], numberOfSeasons: null, seasons: [],
    });
    expect(JSON.stringify(d)).not.toContain("secret");
  });
  it("lists the cast once each, with only safe pictures", () => {
    expect(normalizeDetail(MOVIE, "movie")!.cast).toEqual([
      { id: 1, name: "Mara Quill", role: "Ines", profilePath: "/m.jpg" },
      { id: 2, name: "Tomas Reed", role: "Gus", profilePath: null },
    ]);
  });
  it("picks the YouTube trailer, not a featurette or another site's", () => {
    expect(normalizeDetail(MOVIE, "movie")!.trailerUrl).toBe("https://www.youtube.com/watch?v=trail000001");
    expect(normalizeDetail({ ...MOVIE, relatedVideos: [] }, "movie")!.trailerUrl).toBeNull();
    expect(normalizeDetail({ ...MOVIE, relatedVideos: [{ site: "YouTube", key: "x y z", type: "Trailer" }] }, "movie")!.trailerUrl).toBeNull();
  });
  it("only links to web pages", () => {
    expect(normalizeDetail({ ...MOVIE, homepage: "javascript:alert(1)" }, "movie")!.homepage).toBeNull();
  });
  it("falls back to another region's rating when there is no US one", () => {
    expect(normalizeDetail({ ...MOVIE, releases: { results: [{ iso_3166_1: "GB", release_dates: [{ certification: "12A" }] }] } }, "movie")!.certification).toBe("12A");
    expect(normalizeDetail({ ...MOVIE, releases: undefined }, "movie")!.certification).toBeNull();
  });
  it("reads a show: creators, networks, seasons, next episode", () => {
    const d = normalizeDetail(
      {
        id: 7, name: "Night Ferry", firstAirDate: "2020-02-01", lastAirDate: "2024-06-01", status: "Returning Series", numberOfSeasons: 3, numberOfEpisodes: 22, runtime: 50, voteAverage: 0,
        createdBy: [{ name: "Ila Brandt" }], networks: [{ name: "Riverlight" }], nextEpisodeToAir: { airDate: "2099-01-01", seasonNumber: 3, episodeNumber: 2 },
        contentRatings: { results: [{ iso_3166_1: "DE", rating: "12" }, { iso_3166_1: "US", rating: "TV-14" }] }, seasons: [{ seasonNumber: 0 }, { seasonNumber: 1, name: "Season 1", episodeCount: 6 }],
      },
      "tv",
    )!;
    expect(d).toMatchObject({ creators: ["Ila Brandt"], networks: ["Riverlight"], certification: "TV-14", numberOfSeasons: 3, numberOfEpisodes: 22, date: "2020-02-01", lastDate: "2024-06-01", runtime: null, rating: null, nextEpisode: { season: 3, episode: 2, airDate: "2099-01-01" } });
    expect(d.seasons.map((s) => s.number)).toEqual([1]);
  });
  it("gives a movie no seasons and rejects what isn't a title", () => {
    expect(normalizeDetail({ id: 1, title: "M", seasons: [{ seasonNumber: 1 }] }, "movie")?.seasons).toEqual([]);
    expect(normalizeDetail(null, "tv")).toBeNull();
    expect(normalizeDetail({ id: 1 }, "movie")).toBeNull();
  });
});

describe("normalizeList", () => {
  it("fills in the type Seerr left out and drops anything unusable", () => {
    const list = normalizeList({ results: [{ id: 1, title: "A" }, { id: 2, name: "B", mediaType: "tv" }, { id: 3 }, "x"] }, "movie");
    expect(list.map((i) => [i.id, i.mediaType, i.title])).toEqual([[1, "movie", "A"], [2, "tv", "B"]]);
    expect(normalizeList(null, "movie")).toEqual([]);
  });
});

describe("normalizeEpisodes", () => {
  it("sorts a season's episodes and keeps stills as plain file names", () => {
    const eps = normalizeEpisodes({ episodes: [{ episodeNumber: 2, name: "Two", airDate: "2020-01-09", runtime: 0, stillPath: "https://image.tmdb.org/t/p/original//two.jpg" }, { episodeNumber: 1, overview: "First." }, { name: "no number" }] });
    expect(eps).toEqual([
      { number: 1, name: "Episode 1", overview: "First.", airDate: null, runtime: null, stillPath: null },
      { number: 2, name: "Two", overview: "", airDate: "2020-01-09", runtime: null, stillPath: "/two.jpg" },
    ]);
  });
});

describe("normalizePerson and normalizeCredits", () => {
  it("reads a person, with non-breaking spaces turned into spaces", () => {
    expect(normalizePerson({ id: 5, name: "Mara Quill", biography: "Born\u00a0here.", birthday: "1984-03-07", deathday: null, placeOfBirth: "Port Alder", profilePath: "/m.jpg", knownForDepartment: "Acting" })).toEqual({
      id: 5, name: "Mara Quill", biography: "Born here.", birthday: "1984-03-07", deathday: null, placeOfBirth: "Port Alder", profilePath: "/m.jpg", department: "Acting",
    });
    expect(normalizePerson({ id: 5 })).toBeNull();
  });
  it("lists each credit once, best known first for acting and newest first for crew", () => {
    const c = normalizeCredits({
      cast: [{ id: 1, mediaType: "movie", title: "Quiet", voteCount: 10, character: "A" }, { id: 2, mediaType: "tv", name: "Loud", voteCount: 9000, character: "B" }, { id: 2, mediaType: "tv", name: "Loud", voteCount: 9000, character: "B" }, { id: 3, mediaType: "person", name: "x" }, { id: 4, mediaType: "movie", title: "Mid", voteCount: 500, character: "C" }, { id: 5, mediaType: "movie", title: "Mid2", voteCount: 400, character: "D" }],
      crew: [{ id: 6, mediaType: "movie", title: "Old", releaseDate: "1999-01-01" }, { id: 7, mediaType: "movie", title: "New", releaseDate: "2021-01-01" }],
    });
    expect(c.cast.map((i) => i.title)).toEqual(["Loud", "Mid", "Mid2", "Quiet"]);
    expect(c.crew.map((i) => i.title)).toEqual(["New", "Old"]);
    expect(normalizeCredits(null)).toEqual({ cast: [], crew: [] });
  });
  it("leaves out talk-show appearances, but keeps them when they're nearly all there is", () => {
    const role = (id: number, character: string, voteCount = 1) => ({ id, mediaType: "movie", title: `T${id}`, character, voteCount });
    const plenty = normalizeCredits({ cast: [role(1, "Himself", 99999), role(2, "Self - Guest", 99999), role(3, "Walter"), role(4, "Jesse"), role(5, "Skyler"), role(6, "Hank")] });
    expect(plenty.cast.map((i) => i.id).sort()).toEqual([3, 4, 5, 6]);
    const few = normalizeCredits({ cast: [role(1, "Herself"), role(2, "Self"), role(3, "Judge")] });
    expect(few.cast).toHaveLength(3);
  });
});

describe("normalizeRequests", () => {
  const req = (over: object, media: object = {}) => ({ id: 1, status: 1, createdAt: "2026-10-01T12:00:00.000Z", seasons: [], media: { tmdbId: 9001, mediaType: "movie", status: 2, ...media }, requestedBy: { email: "x@y.z" }, ...over });
  const run = (...rows: object[]) => normalizeRequests({ results: rows });

  it("works out where each request stands", () => {
    expect(run(req({ status: 1 }))[0]?.state).toBe("waiting");
    expect(run(req({ status: 2 }, { status: 3 }))[0]?.state).toBe("approved");
    expect(run(req({ status: 3 }))[0]?.state).toBe("declined");
    // Once the title is in the library it is available, whatever the request says.
    expect(run(req({ status: 2 }, { status: 5, jellyfinMediaId: "abc123" }))[0]).toMatchObject({ state: "available", jellyfinId: "abc123" });
    expect(run(req({ status: 3 }, { status: 5 }))[0]?.state).toBe("declined");
  });
  it("keeps only what the page needs", () => {
    expect(run(req({}))[0]).toEqual({ id: 1, mediaType: "movie", tmdbId: 9001, state: "waiting", seasons: [], createdAt: "2026-10-01T12:00:00.000Z", jellyfinId: null });
  });
  it("lists a show's seasons in order and leaves out Specials", () => {
    const row = run(req({ seasons: [{ seasonNumber: 3 }, { seasonNumber: 0 }, { seasonNumber: 1 }] }, { mediaType: "tv", tmdbId: 5 }))[0];
    expect(row).toMatchObject({ mediaType: "tv", seasons: [1, 3] });
  });
  it("only gives a Jellyfin id once available, and only a plain one", () => {
    expect(run(req({}, { jellyfinMediaId: "abc" }))[0]?.jellyfinId).toBeNull();
    expect(run(req({}, { status: 5, jellyfinMediaId: "../x" }))[0]?.jellyfinId).toBeNull();
  });
  it("skips rows it can't use", () => {
    expect(run({ id: 2 }, { id: 3, media: { tmdbId: 0, mediaType: "movie" } }, { id: 4, media: { tmdbId: 5, mediaType: "music" } }, null as never)).toEqual([]);
    expect(normalizeRequests(null)).toEqual([]);
  });
});
