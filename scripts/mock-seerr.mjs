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

const movies = [
  { id: 9001, title: "Lantern Harbor", releaseDate: "2019-05-03", overview: "A night watchman tends the last lamp on a foggy coast.", posterPath: "/lanternharbor.jpg", status: 1 },
  { id: 9002, title: "Paper Comet", releaseDate: "2021-10-15", overview: "Two friends fold a comet out of paper.", posterPath: "/papercomet.jpg", status: 5 },
];
const shows = [
  {
    id: 9101,
    name: "Night Ferry",
    firstAirDate: "2020-02-01",
    overview: "A ferry crosses the same river every night, never the same way twice.",
    posterPath: "/nightferry.jpg",
    seasons: [
      { seasonNumber: 0, name: "Specials", episodeCount: 2 },
      { seasonNumber: 1, name: "Season 1", episodeCount: 6, available: true },
      { seasonNumber: 2, name: "Season 2", episodeCount: 8 },
      { seasonNumber: 3, name: "Season 3", episodeCount: 8 },
    ],
  },
];
/** Requests made since start, as Seerr keeps them. Tests read and clear them through /mock/requests. */
let requests = [];

const isAdmin = (userId) => (users.find((u) => u.id === userId)?.permissions & ADMIN) !== 0;

function movieInfo(m) {
  const r = requests.find((x) => x.mediaType === "movie" && x.mediaId === m.id);
  const status = r ? (r.status === 1 ? 2 : 3) : m.status;
  return status === 1 ? undefined : { status, requests: r ? [{ id: r.id, status: r.status }] : [] };
}
function tvInfo(t) {
  const reqs = requests.filter((x) => x.mediaType === "tv" && x.mediaId === t.id);
  const availableSeasons = t.seasons.filter((s) => s.available).map((s) => ({ seasonNumber: s.seasonNumber, status: 5 }));
  if (!reqs.length && !availableSeasons.length) return undefined;
  return {
    status: reqs.length ? 3 : 4,
    seasons: availableSeasons,
    requests: reqs.map((r) => ({ id: r.id, status: r.status, seasons: r.seasons.map((n) => ({ seasonNumber: n })) })),
  };
}
const movieOut = (m) => ({ id: m.id, mediaType: "movie", title: m.title, releaseDate: m.releaseDate, overview: m.overview, posterPath: m.posterPath, mediaInfo: movieInfo(m) });
const tvOut = (t) => ({ id: t.id, mediaType: "tv", name: t.name, firstAirDate: t.firstAirDate, overview: t.overview, posterPath: t.posterPath, seasons: t.seasons.map((s) => ({ seasonNumber: s.seasonNumber, name: s.name, episodeCount: s.episodeCount })), mediaInfo: tvInfo(t) });

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
  const movieRoute = path.match(/^\/api\/v1\/movie\/(\d+)$/);
  if (movieRoute) {
    const m = movies.find((x) => x.id === Number(movieRoute[1]));
    return m ? json(res, movieOut(m)) : json(res, { message: "Not found" }, 404);
  }
  const tvRoute = path.match(/^\/api\/v1\/tv\/(\d+)$/);
  if (tvRoute) {
    const t = shows.find((x) => x.id === Number(tvRoute[1]));
    return t ? json(res, tvOut(t)) : json(res, { message: "Not found" }, 404);
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
      const request = { id: requests.length + 1, mediaType: body.mediaType, mediaId: body.mediaId, seasons: body.seasons ?? [], status: isAdmin(who) ? 2 : 1, by: who, body };
      requests.push(request);
      json(res, { id: request.id, status: request.status, requestedBy: { id: who } }, 201);
    });
  }

  json(res, { message: "Not found" }, 404);
});

server.listen(PORT, "127.0.0.1", () => console.log(`Mock Seerr on http://127.0.0.1:${PORT}`));
