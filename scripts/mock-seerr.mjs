#!/usr/bin/env node
// Mock Seerr server for tests and screenshots: `node scripts/mock-seerr.mjs`.
//
// Answers the few Seerr API routes Jelly Shark uses, with fictional data and
// nothing fetched from the network. Seerr's real API lives at /api/v1.
//
// Keys: `mock-seerr-api-key` belongs to the administrator; `mock-seerr-user-key`
// is a key without admin rights (to test that Jelly Shark refuses it).
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SEERR_PORT ?? 5056);
const ADMIN_KEY = "mock-seerr-api-key";
const USER_KEY = "mock-seerr-user-key";

const ADMIN = 2; // Seerr's Admin permission bit
const REQUEST = 32;

/* ---------- fictional data ---------- */

const DEMO_JF_ID = "a1b2c3d4e5f647488a9b0c1d2e3f4a5b";
const GUEST_JF_ID = "b2c3d4e5f6a748499b0c1d2e3f4a5b6c"; // the mock Jellyfin's second user
const users = [{ id: 1, displayName: "demo", jellyfinUsername: "demo", jellyfinUserId: DEMO_JF_ID, permissions: ADMIN }];

// A 1x1 PNG standing in for every poster.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const PEOPLE = {
  7001: { id: 7001, name: "Mara Quill", birthday: "1984-03-07", placeOfBirth: "Port Alder, Norland", knownForDepartment: "Acting", profilePath: "/maraquill.jpg", biography: "Mara Quill is a stage and screen actor from Port Alder. She began in repertory theatre before her breakout as a lighthouse keeper.\n\nShe has since worked with several directors on both sides of the camera, and runs a small touring company.\nShe lives by the sea, where she keeps a small boat, a large dog and an uncomfortable number of unread scripts, all of which she insists she will get to." },
  7002: { id: 7002, name: "Tomas Reed", birthday: "1971-11-20", placeOfBirth: null, knownForDepartment: "Acting", profilePath: null, biography: "" },
  7003: { id: 7003, name: "Ila Brandt", birthday: "1979-06-02", knownForDepartment: "Directing", profilePath: "/ilabrandt.jpg", biography: "Ila Brandt directs quiet films about small places." },
};
const cast = (...ids) => ids.map((id, order) => ({ id, name: PEOPLE[id].name, character: ["Captain Ines Vale", "Old Gus", "The Ferryman"][order] ?? "Extra", order, profilePath: PEOPLE[id].profilePath }));

const movies = [
  {
    id: 9001, title: "Lantern Harbor", releaseDate: "2019-05-03", overview: "A night watchman tends the last lamp on a foggy coast. When a ship goes missing she has until dawn to bring it home.",
    tagline: "Keep the light on.", posterPath: "/lanternharbor.jpg", backdropPath: "/lanternharborbg.jpg", status: 1, runtime: 136, voteAverage: 7.8, budget: 63000000, revenue: 463517383,
    genres: ["Drama", "Mystery"], studios: ["Foghorn Pictures", "Second Tide Films"], language: "en", homepage: "https://lantern-harbor.example/",
    cast: cast(7001, 7002), crew: [{ id: 7003, name: "Ila Brandt", job: "Director" }, { id: 7003, name: "Ila Brandt", job: "Screenplay" }], certification: "PG-13",
    trailerKey: "mockTrailer01", related: [9002], similar: [9002, 9003],
  },
  {
    id: 9002, title: "Paper Comet", releaseDate: "2021-10-15", overview: "Two friends fold a comet out of paper.", posterPath: "/papercomet.jpg", backdropPath: null, status: 5, runtime: 94, voteAverage: 6.9,
    genres: ["Animation"], studios: ["Origami Works"], language: "ja", cast: cast(7002), crew: [], certification: "G", jellyfinId: "m001", related: [9001], similar: [],
  },
  {
    id: 9003, title: "Tide Table", releaseDate: "2017-08-18", overview: "A clerk in a harbor office keeps the only copy of the tides.", posterPath: "/tidetable.jpg", backdropPath: null, status: 1, runtime: 101, voteAverage: 6.4,
    genres: ["Comedy"], studios: ["Second Tide Films"], language: "en", cast: [], crew: [], certification: "PG", related: [], similar: [],
  },
];
const shows = [
  {
    id: 9101, name: "Night Ferry", firstAirDate: "2020-02-01", lastAirDate: "2024-06-01", overview: "A ferry crosses the same river every night, never the same way twice.", tagline: "Mind the gap.",
    posterPath: "/nightferry.jpg", backdropPath: "/nightferrybg.jpg", voteAverage: 8.4, genres: ["Drama", "Fantasy"], networks: ["Riverlight"], creators: ["Ila Brandt"], language: "en", certification: "TV-14",
    statusText: "Returning Series", cast: cast(7001, 7002), crew: [], jellyfinId: "s002", trailerKey: null, related: [9001], similar: [],
    nextEpisode: { airDate: "2099-01-01", seasonNumber: 3, episodeNumber: 2 },
    seasons: [
      { seasonNumber: 0, name: "Specials", episodeCount: 2 },
      { seasonNumber: 1, name: "Season 1", episodeCount: 6, available: true },
      { seasonNumber: 2, name: "Season 2", episodeCount: 8 },
      { seasonNumber: 3, name: "Season 3", episodeCount: 8 },
    ],
  },
];
shows.push({
  id: 9102, name: "Long Haul", firstAirDate: "2010-01-01", lastAirDate: "2015-01-01", overview: "A freight crew crosses a continent, five seasons long.", tagline: "", posterPath: "/longhaul.jpg", backdropPath: null,
  voteAverage: 7.1, genres: ["Drama"], networks: ["Railbed"], creators: [], language: "en", certification: "TV-PG", statusText: "Ended", cast: [], crew: [], jellyfinId: null, nextEpisode: null, related: [], similar: [],
  seasons: [1, 2, 3, 4, 5].map((n) => ({ seasonNumber: n, name: `Season ${n}`, episodeCount: 4 })),
});
/** A season's episodes: the last of season 3 hasn't aired yet. Stills come as full URLs, as TMDB sends them. */
function episodesOf(show, n) {
  const season = show.seasons.find((x) => x.seasonNumber === n);
  if (!season) return null;
  return Array.from({ length: season.episodeCount }, (_, i) => {
    const num = i + 1;
    const upcoming = n === 3 && num >= 2;
    return {
      id: n * 100 + num, episodeNumber: num, seasonNumber: n, name: `S${n} Episode ${num}`, overview: `The ferry's ${num}th crossing of the season goes somewhere unexpected.`,
      airDate: upcoming ? "2099-01-01" : `2020-0${n}-1${num}`, runtime: 42 + num, stillPath: `https://image.tmdb.org/t/p/original//ferrystill${n}x${num}.jpg`,
    };
  });
}
/** Requests made since start, as Seerr keeps them. Tests read and clear them through /mock/requests. */
let requests = [];

const isAdmin = (userId) => (users.find((u) => u.id === userId)?.permissions & ADMIN) !== 0;

function movieInfo(m) {
  const r = requests.find((x) => x.mediaType === "movie" && x.mediaId === m.id);
  const status = r ? (r.status === 1 ? 2 : 3) : m.status;
  return status === 1 ? undefined : { status, jellyfinMediaId: status === 5 ? m.jellyfinId : null, requests: r ? [{ id: r.id, status: r.status }] : [] };
}
function tvInfo(t) {
  const reqs = requests.filter((x) => x.mediaType === "tv" && x.mediaId === t.id);
  const availableSeasons = t.seasons.filter((s) => s.available).map((s) => ({ seasonNumber: s.seasonNumber, status: 5 }));
  if (!reqs.length && !availableSeasons.length) return undefined;
  return {
    status: availableSeasons.length ? 4 : 3,
    jellyfinMediaId: availableSeasons.length ? t.jellyfinId : null,
    seasons: availableSeasons,
    requests: reqs.map((r) => ({ id: r.id, status: r.status, seasons: r.seasons.map((n) => ({ seasonNumber: n })) })),
  };
}
const credits = (c, crew) => ({ cast: c.map((p) => ({ castId: p.id, character: p.character, id: p.id, name: p.name, order: p.order, profilePath: p.profilePath })), crew });
const movieOut = (m) => ({
  id: m.id, mediaType: "movie", title: m.title, releaseDate: m.releaseDate, overview: m.overview, posterPath: m.posterPath, mediaInfo: movieInfo(m),
  tagline: m.tagline ?? "", backdropPath: m.backdropPath ?? null, runtime: m.runtime, voteAverage: m.voteAverage, status: "Released", originalLanguage: m.language,
  budget: m.budget ?? 0, revenue: m.revenue ?? 0, homepage: m.homepage ?? "", genres: m.genres.map((name, id) => ({ id, name })), productionCompanies: m.studios.map((name, id) => ({ id, name })),
  credits: credits(m.cast, m.crew),
  releases: { results: [{ iso_3166_1: "GB", release_dates: [{ certification: "12A" }] }, { iso_3166_1: "US", release_dates: [{ certification: "" }, { certification: m.certification }] }] },
  relatedVideos: [
    { site: "YouTube", key: "mockFeature01", name: "Behind the lamp", type: "Featurette", url: "https://www.youtube.com/watch?v=mockFeature01" },
    ...(m.trailerKey ? [{ site: "YouTube", key: m.trailerKey, name: "Official Trailer", type: "Trailer", url: `https://www.youtube.com/watch?v=${m.trailerKey}` }] : []),
  ],
});
const tvOut = (t) => ({
  id: t.id, mediaType: "tv", name: t.name, firstAirDate: t.firstAirDate, lastAirDate: t.lastAirDate, overview: t.overview, tagline: t.tagline, posterPath: t.posterPath, backdropPath: t.backdropPath,
  voteAverage: t.voteAverage, status: t.statusText, originalLanguage: t.language, genres: t.genres.map((name, id) => ({ id, name })), networks: t.networks.map((name, id) => ({ id, name })),
  createdBy: t.creators.map((name, id) => ({ id, name, profile_path: null })), numberOfSeasons: 3, numberOfEpisodes: 22, nextEpisodeToAir: t.nextEpisode, credits: credits(t.cast, t.crew),
  contentRatings: { results: [{ iso_3166_1: "DE", rating: "12" }, { iso_3166_1: "US", rating: t.certification }] }, relatedVideos: [],
  seasons: t.seasons.map((s) => ({ seasonNumber: s.seasonNumber, name: s.name, episodeCount: s.episodeCount })), mediaInfo: tvInfo(t),
});
// Recommendations and similar results leave mediaType out for some endpoints, as Seerr does.
const listOut = (ids) => ({ page: 1, totalPages: 1, totalResults: ids.length, results: ids.map((id) => Object.fromEntries(Object.entries(movieOut(movies.find((x) => x.id === id))).filter(([k]) => k !== "mediaType"))) });

const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

function readBody(req, then) {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    try {
      then(JSON.parse(raw || "{}"));
    } catch {
      then({});
    }
  });
}

const server = createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const key = req.headers["x-api-key"];

  if (path === "/api/v1/status") return json(res, { version: "3.5.1", commitTag: "mock", updateAvailable: false, commitsBehind: 0, restartRequired: false });

  if (path === "/api/v1/auth/me") {
    if (key === ADMIN_KEY) return json(res, { id: 1, displayName: "demo", permissions: ADMIN, jellyfinUserId: "a1b2c3d4e5f647488a9b0c1d2e3f4a5b" });
    if (key === USER_KEY) return json(res, { id: 2, displayName: "guest", permissions: REQUEST });
    return json(res, { message: "Forbidden" }, 403);
  }

  // Posters and the test helpers need no key (Seerr's image proxy doesn't either).
  if (path.startsWith("/imageproxy/")) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(PIXEL);
  }
  if (path === "/mock/requests" && req.method === "POST") {
    // Test helper: add a request as it would exist already (any status, any person).
    return readBody(req, (b) => {
      requests.push({ id: requests.length + 1, mediaType: b.mediaType, mediaId: b.mediaId, seasons: b.seasons ?? [], status: b.status ?? 1, by: b.by ?? 1, body: b, createdAt: b.createdAt ?? new Date().toISOString() });
      json(res, requests.at(-1), 201);
    });
  }
  if (path === "/mock/requests") {
    if (req.method === "DELETE") {
      requests = [];
      users.splice(1); // forget anyone imported during a test
    }
    return json(res, requests);
  }

  if (path.startsWith("/api/v1/") && key !== ADMIN_KEY) return json(res, { message: "Forbidden" }, 403);

  // `X-Api-User` makes a call act as that Seerr user; an unknown id is refused, as in Seerr.
  const asUser = req.headers["x-api-user"] === undefined ? undefined : Number(req.headers["x-api-user"]);
  if (asUser !== undefined && !users.some((u) => u.id === asUser)) return json(res, { message: "Forbidden" }, 403);

  if (path === "/api/v1/user" && req.method === "GET") {
    const take = Number(u.searchParams.get("take") ?? 10);
    const skip = Number(u.searchParams.get("skip") ?? 0);
    return json(res, { pageInfo: { pages: 1, pageSize: take, results: users.length, page: 1 }, results: users.slice(skip, skip + take) });
  }
  if (path === "/api/v1/user/import-from-jellyfin" && req.method === "POST") {
    return readBody(req, (body) => {
      const made = [];
      for (const id of body.jellyfinUserIds ?? []) {
        if (id !== GUEST_JF_ID || users.some((x) => x.jellyfinUserId === id)) continue;
        const user = { id: users.length + 1, displayName: "guest", jellyfinUsername: "guest", jellyfinUserId: id, permissions: REQUEST };
        users.push(user);
        made.push(user);
      }
      json(res, made, 201);
    });
  }

  if (path === "/api/v1/search") {
    const q = (u.searchParams.get("query") ?? "").toLowerCase();
    const found = [...movies.filter((m) => m.title.toLowerCase().includes(q)).map(movieOut), ...shows.filter((t) => t.name.toLowerCase().includes(q)).map(tvOut)];
    // People turn up in real search results; Jelly Shark leaves them out.
    if ("a. person".includes(q) && q.length > 1) found.push({ id: 5, mediaType: "person", name: "A. Person" });
    return json(res, { page: 1, totalPages: 1, totalResults: found.length, results: found });
  }
  const titleRoute = path.match(/^\/api\/v1\/(movie|tv)\/(\d+)(?:\/(recommendations|similar|season\/(\d+)))?$/);
  if (titleRoute) {
    const [, type, rawId, sub, seasonN] = titleRoute;
    const t = (type === "movie" ? movies : shows).find((x) => x.id === Number(rawId));
    if (!t) return json(res, { message: "Not found" }, 404);
    if (!sub) return json(res, type === "movie" ? movieOut(t) : tvOut(t));
    if (sub === "recommendations") return json(res, listOut(t.related));
    if (sub === "similar") return json(res, listOut(t.similar));
    const episodes = type === "tv" ? episodesOf(t, Number(seasonN)) : null;
    return episodes ? json(res, { id: Number(rawId) * 10 + Number(seasonN), name: `Season ${seasonN}`, seasonNumber: Number(seasonN), episodes }) : json(res, { message: "Not found" }, 404);
  }
  const personRoute = path.match(/^\/api\/v1\/person\/(\d+)(\/combined_credits)?$/);
  if (personRoute) {
    const person = PEOPLE[Number(personRoute[1])];
    if (!person) return json(res, { message: "Not found" }, 404);
    if (!personRoute[2]) return json(res, { ...person, deathday: null, alsoKnownAs: [], gender: 1, popularity: 3, adult: false, homepage: null });
    const asCast = [...movies.map((m) => ({ ...movieOut(m), character: "A role", popularity: m.voteAverage })), ...shows.map((t) => ({ ...tvOut(t), character: "A role", popularity: t.voteAverage }))].filter((c) => (c.mediaType === "movie" ? movies.find((m) => m.id === c.id).cast : shows.find((t) => t.id === c.id).cast).some((p) => p.id === person.id));
    const asCrew = movies.filter((m) => m.crew.some((c) => c.id === person.id)).map((m) => ({ ...movieOut(m), job: "Director", department: "Directing", popularity: 1 }));
    // Like TMDB, the same title can be listed more than once.
    return json(res, { id: person.id, cast: [...asCast, ...asCast.slice(0, 1)], crew: asCrew });
  }

  if (path === "/api/v1/request" && req.method === "GET") {
    // Like Seerr, an administrator gets everyone's requests unless `requestedBy` says whose.
    const by = u.searchParams.get("requestedBy");
    const mine = requests.filter((r) => (by ? r.by === Number(by) : isAdmin(asUser ?? 1) || r.by === asUser));
    const results = [...mine].reverse().map((r) => {
      const media = r.mediaType === "movie" ? movies.find((m) => m.id === r.mediaId) : shows.find((t) => t.id === r.mediaId);
      return { id: r.id, status: r.status, createdAt: r.createdAt, type: r.mediaType, seasons: r.seasons.map((n) => ({ seasonNumber: n })), requestedBy: { id: r.by }, media: { tmdbId: r.mediaId, mediaType: r.mediaType, status: media.status === 5 ? 5 : r.status === 2 ? 3 : 2, jellyfinMediaId: media.status === 5 ? media.jellyfinId : null } };
    });
    return json(res, { pageInfo: { pages: 1, pageSize: 60, results: results.length, page: 1 }, results });
  }
  if (path === "/api/v1/request" && req.method === "POST") {
    return readBody(req, (body) => {
      const who = asUser ?? 1;
      const known = body.mediaType === "movie" ? movies.some((m) => m.id === body.mediaId) : shows.some((t) => t.id === body.mediaId);
      if (!known) return json(res, { message: "Not found" }, 404);
      if (body.mediaType === "movie") {
        if (requests.some((r) => r.mediaType === "movie" && r.mediaId === body.mediaId) || movies.find((m) => m.id === body.mediaId).status === 5) return json(res, { message: "Request for this media already exists." }, 409);
      } else {
        const show = shows.find((t) => t.id === body.mediaId);
        const taken = new Set([...show.seasons.filter((s) => s.available).map((s) => s.seasonNumber), ...requests.filter((r) => r.mediaType === "tv" && r.mediaId === body.mediaId).flatMap((r) => r.seasons)]);
        if (!Array.isArray(body.seasons) || body.seasons.length === 0 || body.seasons.every((n) => taken.has(n))) return json(res, { message: "No seasons available to request" }, 202);
      }
      // Seerr approves an administrator's requests straight away; everyone else waits.
      const request = { id: requests.length + 1, mediaType: body.mediaType, mediaId: body.mediaId, seasons: body.seasons ?? [], status: isAdmin(who) ? 2 : 1, by: who, body, createdAt: new Date().toISOString() };
      requests.push(request);
      json(res, { id: request.id, status: request.status, requestedBy: { id: who } }, 201);
    });
  }

  json(res, { message: "Not found" }, 404);
});

server.listen(PORT, "127.0.0.1", () => console.log(`Mock Seerr on http://127.0.0.1:${PORT}`));
