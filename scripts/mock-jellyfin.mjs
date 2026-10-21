#!/usr/bin/env node
// Mock Jellyfin server for development and screenshots: `node scripts/mock-jellyfin.mjs`.
//
// Serves the slices of the Jellyfin API Jelly Shark reads while browsing
// (auth, views, home rows, items, shows, music, search, images), so the UI is
// fully browsable with fictional content and no real server: run
// `JELLYFIN_URL=http://127.0.0.1:8920 npm start` and sign in with any
// username and password. The signed-in account is "demo".
//
// All titles are fictional placeholders. Nothing is fetched from the network
// or written outside the process. Art is generated SVG.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8920);

/* ---------- deterministic randomness ---------- */

function hashNum(str) {
  let h = 0;
  for (const c of str) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h >>> 0;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(47);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => Math.floor(rnd() * (hi - lo + 1)) + lo;

/* ---------- fictional dataset ---------- */

const USER_ID = "a1b2c3d4e5f647488a9b0c1d2e3f4a5b"; // 32 hex, like real ids
const SERVER_ID = "0f1e2d3c4b5a49488796877463524130";
const SERVER_NAME = "Demo Server";
const USER = { Id: USER_ID, Name: "demo", PrimaryImageTag: "demoavatar", ServerId: SERVER_ID };

const PEOPLE = [
  ["Juno Halley", "Actor"], ["Lena Moss", "Actor"], ["Teo Marchetti", "Actor"],
  ["Cora Vane", "Actor"], ["Iris Calloway", "Actor"], ["Nico Faraday", "Actor"],
  ["Ada Solberg", "Actor"], ["Ray Okonkwo", "Actor"], ["Marta Quill", "Actor"],
  ["Devon Arceneaux", "Actor"], ["Avery Lin", "Actor"], ["Cass Mercer", "Actor"],
  ["Wren Holloway", "Director"], ["Sable Duval", "Director"],
];
const STUDIOS = ["Aperture Fiction", "Meridian Pictures", "Nightstand Films", "Paperboat Studio", "Waypoint Media"];

const MOVIE_TITLES = [
  "Low Orbit", "Dead Reckoning", "Glasshouse", "Midnight Parallax", "The Long Summer",
  "Paper Lanterns", "Harbor Lights", "Neon Tide", "Static Bloom", "Iron Halcyon",
  "Slow Satellites", "The Cartographer", "Signal Fires", "Winter Colony", "Velvet Arcade",
  "Salt Marsh", "The Understudy", "Blue Meridian", "Concrete Garden", "Afterhours Static",
  "Northern Glow", "Last Ferry Out", "The Quiet Fleet", "Marigold Season",
];
const MOVIE_GENRES = ["Drama", "Sci-Fi", "Mystery", "Comedy", "Thriller", "Adventure", "Romance", "Documentary"];
const RATINGS = ["G", "PG", "PG-13", "TV-14", "R"];

const SERIES_FACTS = [
  ["Long Summer", 3, 6], ["Harbor Lights", 2, 5], ["The Understudy", 1, 8],
  ["Dead Reckoning", 3, 7], ["Glasshouse", 2, 6], ["Neon Tide", 1, 5],
];
const EPISODE_WORDS = [
  "Pilot", "Undertow", "The Long Way Home", "Saltline", "Cold Open", "The Mariner",
  "Static", "Night Market", "Crossroads", "The Descent", "Ground Truth", "Last Light",
  "Night Market II", "The Letter", "Homecoming", "Driftwood", "The Archive", "Blue Hour",
];

const ARTIST_FACTS = [
  ["Juno Halley", ["Late Drive", "Rainy Sunday", "Glasshouse"]],
  ["Okari", ["Low Orbit (Original Score)"]],
  ["Static Parish", ["Afterhours Static", "Neon Tide"]],
  ["Velvet Arcade", ["Velvet Arcade"]],
  ["Coastline Radio", ["Harbor Lights"]],
  ["Teo Marchetti", ["Marigold Season", "Paper Lanterns"]],
  ["Lena Moss", ["Salt Marsh"]],
  ["Ada Solberg", ["Iron Halcyon"]],
];
const SONG_WORDS = [
  "Undertow", "Cold Open", "Night Market", "Blue Hour", "Driftwood", "Static",
  "Marigold", "Paper Lantern", "Ferry Song", "Saltwater", "Tape Hiss", "Northbound",
  "Half Light", "Glasshouse", "Sea Glass", "Meridian", "Low Orbit", "Rainy Sunday",
  "Slow Satellite", "Neon Tide", "Harbor Lights", "Afterhours", "Iron Halcyon", "Solace",
];
const PLAYLIST_FACTS = [["Demo Picks", 8], ["Late Night Mix", 10], ["Rainy Day Mix", 7]];

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const tagFor = (id, type) => hashNum(`${id}:${type}`).toString(16).padStart(8, "0");

const movies = [];
for (let i = 0; i < MOVIE_TITLES.length; i++) {
  const genres = [pick(MOVIE_GENRES)];
  if (rnd() > 0.6) genres.push(pick(MOVIE_GENRES.filter((g) => !genres.includes(g))));
  const named = [...PEOPLE].sort(() => rnd() - 0.5).slice(0, 3)
    .map(([name]) => ({ Name: name, Type: "Actor", Role: pick(["Lead", "Supporting", "Narrator"]) }));
  const director = pick(PEOPLE.filter(([, t]) => t === "Director"));
  named.push({ Name: director[0], Type: "Director", Role: "Director" });
  movies.push({
    Id: `m${String(i + 1).padStart(3, "0")}`,
    Name: MOVIE_TITLES[i],
    Type: "Movie",
    ProductionYear: int(1978, 2024),
    Genres: genres,
    CommunityRating: Number((6 + rnd() * 3).toFixed(1)),
    OfficialRating: pick(RATINGS),
    RunTimeMinutes: int(88, 158),
    People: named,
    Studios: [{ Name: pick(STUDIOS) }],
    Overview: "A fictional film about quiet people doing loud things in small rooms, told across one long season of weather.",
    DateCreated: daysAgo(int(1, 400)),
  });
}

const seasons = [], episodes = [];
const series = [];
for (let i = 0; i < SERIES_FACTS.length; i++) {
  const [name, seasonCount, epsPer] = SERIES_FACTS[i];
  const sid = `s${String(i + 1).padStart(3, "0")}`;
  series.push({
    Id: sid, Name: name, Type: "Series",
    ProductionYear: int(2006, 2024), Genres: [...new Set([pick(MOVIE_GENRES), pick(MOVIE_GENRES)])],
    Overview: "A fictional series following one place and the people who keep leaving it.",
    DateCreated: daysAgo(int(2, 500)), CommunityRating: Number((6.5 + rnd() * 2.5).toFixed(1)),
  });
  for (let sn = 1; sn <= seasonCount; sn++) {
    seasons.push({
      Id: `sn${i + 1}_${sn}`, Name: `Season ${sn}`, Type: "Season",
      SeriesId: sid, SeriesName: name, IndexNumber: sn,
      DateCreated: daysAgo(int(5, 400)),
    });
    for (let en = 1; en <= epsPer; en++) {
      episodes.push({
        Id: `e${i + 1}_${sn}_${en}`,
        Name: EPISODE_WORDS[(i + sn + en) % EPISODE_WORDS.length],
        Type: "Episode", SeriesId: sid, SeriesName: name, SeasonId: `sn${i + 1}_${sn}`,
        IndexNumber: en, ParentIndexNumber: sn,
        Overview: "An episode where almost nothing and exactly one thing happens.",
        RunTimeMinutes: int(34, 62), DateCreated: daysAgo(int(5, 300)),
      });
    }
  }
}

const audioArtists = [], albums = [], tracks = [];
for (let ai = 0; ai < ARTIST_FACTS.length; ai++) {
  const [artist, albumNames] = ARTIST_FACTS[ai];
  const aid = `ar${ai + 101}`;
  audioArtists.push({
    Id: aid, Name: artist, Type: "MusicArtist",
    Genres: [pick(MOVIE_GENRES)], DateCreated: daysAgo(int(10, 700)),
  });
  for (let bi = 0; bi < albumNames.length; bi++) {
    const alid = `al${ai}_${bi}`;
    const year = int(1995, 2024);
    const n = int(5, 9);
    albums.push({
      Id: alid, Name: albumNames[bi], Type: "MusicAlbum", AlbumArtist: artist,
      AlbumArtists: [{ Name: artist, Id: aid }], ArtistIds: [aid],
      ProductionYear: year, Genres: [pick(MOVIE_GENRES)], ChildCount: n,
      DateCreated: daysAgo(int(3, 900)),
    });
    for (let t = 1; t <= n; t++) {
      tracks.push({
        Id: `tr${alid.slice(2)}_${t}`,
        Name: `${SONG_WORDS[(t * (ai + 2)) % SONG_WORDS.length]}${t > SONG_WORDS.length ? ` (Reprise)` : ""}`,
        Type: "Audio", AlbumId: alid, Album: albumNames[bi],
        AlbumArtist: artist, AlbumArtists: [{ Name: artist, Id: aid }], ArtistIds: [aid],
        Artists: [artist], IndexNumber: t, ParentIndexNumber: 1,
        ProductionYear: year, RunTimeMinutes: int(2, 6), DateCreated: daysAgo(int(1, 900)),
      });
    }
  }
}
const playlists = [];
for (let pi = 0; pi < PLAYLIST_FACTS.length; pi++) {
  const [name, n] = PLAYLIST_FACTS[pi];
  const entries = [];
  for (let t = 0; t < n; t++) entries.push(tracks[int(0, tracks.length - 1)].Id);
  playlists.push({
    Id: `pl${String(pi + 1).padStart(2, "0")}`, Name: name, Type: "Playlist",
    ChildCount: n, EntryIds: [...new Set(entries)], DateCreated: daysAgo(int(5, 300)),
  });
}

const genres = MOVIE_GENRES.map((g, i) => ({ Id: `ge${String(i + 1).padStart(2, "0")}`, Name: g, Type: "Genre" }));
for (const g of genres) {
  g.MusicTaggedIds = tracks.filter((t) => hashNum(`${g.Name}${t.Id}`) % 4 === 0).slice(0, 20).map((t) => t.Id);
}

const viewsRaw = [
  { Id: "vw_movies", Name: "Demo Movies", Type: "View", CollectionType: "movies", ChildCount: movies.length },
  { Id: "vw_tv", Name: "Demo Shows", Type: "View", CollectionType: "tvshows", ChildCount: series.length },
  { Id: "vw_music", Name: "Demo Music", Type: "View", CollectionType: "music", ChildCount: albums.filter((a) => a.Type === "MusicAlbum").length },
];

const byId = new Map();
for (const it of [...movies, ...series, ...seasons, ...episodes, ...albums, ...tracks, ...audioArtists, ...genres, ...playlists, ...viewsRaw]) byId.set(it.Id, it);

/* ---------- user data (seeded play history, favorites, resume points) ---------- */

const userData = new Map();
const setUd = (id, patch) => userData.set(id, { ...userData.get(id), ...patch });
for (const id of ["m002", "m006", "m009", "e1_1_1", "e1_1_2", "e4_1_1"]) {
  setUd(id, { Played: true, PlayCount: int(1, 4), LastPlayedDate: daysAgo(rnd() * 90) });
}
setUd("m003", { PlaybackPositionTicks: 28 * 60 * 10000000, LastPlayedDate: daysAgo(3) });
setUd("m011", { PlaybackPositionTicks: 51 * 60 * 10000000, LastPlayedDate: daysAgo(1) });
setUd("e2_1_1", { PlaybackPositionTicks: 9 * 60 * 10000000, LastPlayedDate: daysAgo(2) });
for (const id of ["m001", "m006", "s002", "m013", "m023", "s004"]) setUd(id, { IsFavorite: true });
for (const id of ["tr21_1", "tr21_2", "tr22_1", "tr23_4", "tr31_1", "tr31_3", "tr40_2", "tr50_5", "tr60_1", "tr60_2", "tr70_3", "tr80_1"]) {
  setUd(id, { Played: true, PlayCount: int(1, 30), LastPlayedDate: daysAgo(rnd() * 40) });
}
/* album-artist play counts (drives "most played" artist sort + "Made for you" mixes) */
const artistPlay = new Map(audioArtists.map((a, i) => [a.Id, i < 4 ? int(80, 400) : int(0, 40)]));

/* ---------- DTO shaping ---------- */

function shapedUserData(id) {
  const d = userData.get(id) ?? {};
  const ticks = d.PlaybackPositionTicks ?? 0;
  return {
    IsFavorite: d.IsFavorite ?? false,
    Played: d.Played ?? (d.PlayCount ?? 0) > 0,
    PlayCount: d.PlayCount ?? (ticks ? 1 : 0),
    LastPlayedDate: d.LastPlayedDate ?? null,
    PlaybackPositionTicks: ticks,
    PlaybackPositionPercentage: ticks ? Math.min(95, 20 + (hashNum(id) % 60)) : 0,
  };
}

function shape(raw, opts = {}) {
  const id = raw.Id;
  const out = {
    Id: id, Name: raw.Name, Type: raw.Type, ServerId: SERVER_ID,
    DateCreated: raw.DateCreated ?? daysAgo(60),
    SortName: (raw.Name ?? "").replace(/^(the|a) /i, ""),
    PrimaryImageAspectRatio: raw.PrimaryImageAspectRatio ?? { Movie: 0.675, Series: 0.675, Season: 0.675, Episode: 1.7778, Audio: 1, MusicAlbum: 1, MusicArtist: 1, Playlist: 1, Person: 1, Genre: 1 }[raw.Type] ?? 1,
  };
  const isVideo = ["Movie", "Series", "Episode"].includes(raw.Type);
  const hasImages = isVideo || ["MusicAlbum", "MusicArtist", "Audio", "Playlist"].includes(raw.Type);
  if (opts.images !== false && hasImages) {
    const tags = { Primary: tagFor(id, "Primary") };
    const blur = {};
    if (raw.Type === "Episode") blur.Primary = { [tags.Primary]: "LeHa9nRj%1Rj~QxY%1t7WB" };
    if (raw.Type === "Movie" || raw.Type === "Series") tags.Thumb = tagFor(id, "Thumb");
    out.ImageTags = tags;
    if (Object.keys(blur).length) out.ImageBlurHashes = blur;
    if (raw.Type === "Movie" || raw.Type === "Series") {
      out.BackdropImageTags = [tagFor(id, "Backdrop")];
      out.ParentBackdropItemId = id;
      out.ParentBackdropImageTags = out.BackdropImageTags;
    }
    if (raw.Type === "Audio") {
      out.ParentPrimaryImageItemId = raw.AlbumId;
      out.ParentPrimaryImageTag = tagFor(raw.AlbumId, "Primary");
      out.AlbumPrimaryImageTag = tagFor(raw.AlbumId, "Primary");
      out.AlbumId = raw.AlbumId;
      out.Album = raw.Album;
    }
  }
  if (raw.SeriesId) {
    out.SeriesId = raw.SeriesId;
    out.SeriesName = raw.SeriesName;
    out.SeasonId = raw.SeasonId;
    out.IndexNumber = raw.IndexNumber;
    out.ParentIndexNumber = raw.ParentIndexNumber;
    if (opts.images !== false) {
      out.ParentThumbItemId = raw.SeriesId;
      out.ParentThumbImageTag = tagFor(raw.SeriesId, "Thumb");
      out.SeriesPrimaryImageTag = tagFor(raw.SeriesId, "Primary");
    }
    out.PremiereDate = raw.PremiereDate ?? raw.DateCreated;
  }
  if (raw.ProductionYear) out.ProductionYear = raw.ProductionYear;
  if (raw.Genres?.length) out.Genres = raw.Genres;
  if (raw.Overview && opts.images !== false) out.Overview = raw.Overview;
  if (raw.People?.length) out.People = raw.People;
  if (raw.Studios?.length) out.Studios = raw.Studios;
  if (raw.CommunityRating) out.CommunityRating = raw.CommunityRating;
  if (raw.OfficialRating) out.OfficialRating = raw.OfficialRating;
  if (raw.RunTimeMinutes) out.RunTimeTicks = raw.RunTimeMinutes * 60 * 10000000;
  if (["Episode", "Movie"].includes(raw.Type) && opts.mediaStreams) {
    out.MediaSources = [{
      Id: raw.Id, Path: `/mnt/demo/${raw.Id}.mkv`, Container: "mp4",
      MediaStreams: [
        { Type: "Video", Codec: "h264", Index: 0, Width: 1920, Height: 1080, BitRate: 5_000_000, AspectRatio: "16:9", IsDefault: true, DisplayTitle: "1080p H264" },
        { Type: "Audio", Codec: "aac", Index: 1, Language: "eng", BitRate: 192_000, Channels: 2, IsDefault: true, DisplayTitle: "English - AAC - Stereo", DisplayLanguage: "English" },
        { Type: "Subtitle", Codec: "subrip", Index: 2, Language: "eng", IsTextSubtitle: true, IsDefault: false, DisplayTitle: "English (SRT)", DisplayLanguage: "English" },
      ],
    }];
    out.ProviderIds = {};
  }
  if (raw.Type === "MusicAlbum") {
    out.AlbumArtist = raw.AlbumArtist;
    out.AlbumArtists = raw.AlbumArtists;
    out.ArtistIds = raw.ArtistIds;
    out.ChildCount = raw.ChildCount ?? 0;
    out.RecursiveItemCount = out.ChildCount;
  }
  if (raw.Type === "Playlist") {
    out.ChildCount = raw.ChildCount ?? 0;
    out.RecursiveItemCount = raw.ChildCount ?? 0;
  }
  if (raw.Type === "MusicArtist") {
    out.ChildCount = albums.filter((a) => a.AlbumArtist === raw.Name).length;
    out.AlbumCount = out.ChildCount;
  }
  if (raw.Type === "Genre") {
    out.SongCount = (raw.MusicTaggedIds ?? []).length;
    out.AlbumCount = albums.filter((a) => a.Genres?.includes(raw.Name)).length;
    out.ItemCounts = { MovieCount: movies.filter((m) => m.Genres?.includes(raw.Name)).length + series.filter((s) => s.Genres?.includes(raw.Name)).length, SeriesCount: series.filter((s) => s.Genres?.includes(raw.Name)).length };
  }
  if (raw.Type === "View") {
    out.CollectionType = raw.CollectionType;
    out.ChildCount = raw.ChildCount;
  }
  if (raw.Type === "Person") out.Role = raw.Role;
  out.UserData = shapedUserData(id);
  return out;
}

/* ---------- filtering / sorting ---------- */

const parentChildOf = (child, pid) =>
  child.SeriesId === pid || child.SeasonId === pid || child.AlbumId === pid;

function filterItems(q, pool) {
  let list = pool;
  if (q.get("ids")) {
    const ids = new Set(q.get("ids").split(",").filter(Boolean));
    list = list.filter((i) => ids.has(i.Id));
  }
  if (q.get("parentId")) {
    const pid = q.get("parentId");
    const kind = { vw_movies: "Movie", vw_tv: "Series", vw_music: "MusicAlbum" }[pid];
    list = list.filter((i) => (kind ? i.Type === kind : parentChildOf(i, pid)));
  }
  if (q.get("includeItemTypes")) {
    const types = new Set(q.get("includeItemTypes").split(","));
    list = list.filter((i) => types.has(i.Type));
  }
  if (q.get("filters")) {
    for (const f of q.get("filters").split(",")) {
      if (f === "IsFavorite") list = list.filter((i) => shapedUserData(i.Id).IsFavorite);
      if (f === "IsPlayed") list = list.filter((i) => shapedUserData(i.Id).Played);
    }
  }
  if (q.get("mediaTypes")) {
    const mt = new Set(q.get("mediaTypes").split(","));
    list = list.filter((i) => (mt.has("Video") && (i.Type === "Movie" || i.Type === "Episode")) || (mt.has("Audio") && i.Type === "Audio"));
  }
  if (q.get("searchTerm")) {
    const term = q.get("searchTerm").toLowerCase();
    list = list.filter((i) => (i.Name ?? "").toLowerCase().includes(term)
      || (i.SeriesName ?? "").toLowerCase().includes(term)
      || (i.AlbumArtist ?? "").toLowerCase().includes(term));
  }
  if (q.get("genreIds")) {
    const gids = new Set(q.get("genreIds").split(","));
    const names = new Set(genres.filter((g) => gids.has(g.Id)).map((g) => g.Name));
    list = list.filter((i) => i.Type === "Genre" ? gids.has(i.Id) : (i.Genres ?? []).some((g) => names.has(g)));
  }
  if (q.get("albumIds")) {
    const a = new Set(q.get("albumIds").split(","));
    list = list.filter((i) => a.has(i.AlbumId ?? ""));
  }
  if (q.get("artistIds")) {
    const a = new Set(q.get("artistIds").split(","));
    list = list.filter((i) => (i.ArtistIds ?? []).some((x) => a.has(x)));
  }
  if (q.get("albumArtistIds")) {
    const a = new Set(q.get("albumArtistIds").split(","));
    list = list.filter((i) => (i.AlbumArtists ?? []).some((x) => a.has(x.Id ?? "")));
  }
  if (q.get("seriesId")) list = list.filter((i) => i.SeriesId === q.get("seriesId"));

  const keys = (q.get("sortBy") ?? "").split(",").filter(Boolean);
  const orders = (q.get("sortOrder") ?? "Ascending").split(",").map((o) => o.toLowerCase() === "descending" ? -1 : 1);
  if (keys.length) {
    const value = (item, key) => {
      switch (key) {
        case "DateCreated": return Date.parse(item.DateCreated ?? 0);
        case "DatePlayed": return Date.parse(userData.get(item.Id)?.LastPlayedDate ?? 0);
        case "PlayCount": return artistPlay.get(item.Id) ?? (userData.get(item.Id)?.PlayCount ?? 0);
        case "SortName": case "Name": case "Album": case "AlbumArtist":
          return (key === "Name" ? item.Name : key === "Album" ? item.Album : key === "AlbumArtist" ? item.AlbumArtist : item.SortName ?? "").toLowerCase();
        case "ProductionYear": case "CommunityRating": case "ParentIndexNumber": case "IndexNumber":
          return item[key] ?? 0;
        case "PremiereDate": return Date.parse(item.PremiereDate ?? item.DateCreated ?? 0);
        case "IsFavoriteOrPlayed": return shapedUserData(item.Id).IsFavorite ? 1 : 0;
        default: return (item.SortName ?? "").toLowerCase();
      }
    };
    if (keys[0] === "Random") {
      list = [...list].sort(() => rnd() - 0.5);
    } else {
      list = [...list].sort((a, b) => {
        for (let i = 0; i < keys.length; i++) {
          const av = value(a, keys[i]), bv = value(b, keys[i]);
          if (av !== bv) return (av < bv ? -1 : 1) * orders[i];
        }
        return 0;
      });
    }
  }
  const start = Number(q.get("startIndex") ?? 0);
  const limit = q.get("limit") ? Number(q.get("limit")) : list.length;
  return { total: list.length, page: list.slice(start, start + limit) };
}

function respondOptions(q) {
  return {
    images: (q.get("enableImages") ?? "true") !== "false",
    mediaStreams: (q.get("fields") ?? "").includes("MediaStreams"),
  };
}

/* ---------- placeholder art (SVG, fictional, deterministic) ---------- */

function artSvg(id, type, maxWidth = 800) {
  const seed = hashNum(`${id}:${type}`);
  const hue = seed % 360;
  const sat = 18 + (seed % 26);
  const light = 12 + (Math.floor(seed / 8) % 18);
  const accent = `hsl(${(hue + 40 + (seed % 90)) % 360}, ${sat + 26}%, ${light + 20}%)`;
  const bg = `hsl(${hue}, ${sat}%, ${light}%)`;
  const fg = `hsl(${(hue + 170) % 360}, ${sat}%, ${light + 32}%)`;
  const kind = Math.floor(seed / 32) % 4;
  let shape;
  if (kind === 0) shape = `<circle cx="55" cy="42" r="21" fill="${accent}"/>`;
  else if (kind === 1) shape = `<path d="M27,72 A25,25 0 0 1 27,22 L73,22 L73,72 Z" fill="${accent}"/>`;
  else if (kind === 2) shape = `<rect x="30" y="30" width="40" height="40" rx="3" fill="${accent}"/>`;
  else shape = `<rect x="28" y="62" width="44" height="9" rx="4.5" fill="${accent}"/><rect x="28" y="40" width="44" height="9" rx="4.5" fill="${fg}" opacity="0.5"/>`;
  const max = Math.min(Number(maxWidth) || 800, 1600);
  const two = id.slice(0, 2);
  const aspect = ["Backdrop", "Thumb", "Logo"].includes(type)
    ? (type === "Logo" ? 3.2 : 16 / 9)
    : two === "sn" || two.startsWith("e") ? 1.7778
    : two === "vw" || two === "pl" || two === "pe" || two === "ge" || two.startsWith("al") || two.startsWith("ar") || two.startsWith("tr") ? 1
    : 0.675;
  const w = aspect >= 1.7 ? max : Math.min(max, Math.round(400));
  const h = Math.round(w / aspect);
  return {
    "content-type": "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 100 ${Math.round((100 * h) / w)}" preserveAspectRatio="xMidYMid slice"><rect width="100" height="${Math.round((100 * h) / w)}" fill="${bg}"/>${shape}</svg>`,
  };
}

function avatarSvg() {
  return {
    "content-type": "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#e0893e"/><text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#17212e">D</text></svg>',
  };
}

function imageResult(q, itemId, type) {
  const max = Math.min(Number(q.get("maxWidth") ?? q.get("width") ?? 800) || 800, 1600);
  if (type === "Logo") {
    const hue = hashNum(itemId) % 360;
    return {
      status: 200,
      headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${max}" height="${Math.round(max / 3.2)}"><rect width="100%" height="100%" fill="none"/><text x="50%" y="72%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(max / 9)}" font-weight="700" letter-spacing="${Math.round(max / 90)}" fill="hsl(${hue},30%,74%)">${"DEMO"}</text></svg>`,
    };
  }
  const art = artSvg(itemId, type, max);
  return { status: 200, headers: { "content-type": art["content-type"], "cache-control": "private, max-age=3600" }, body: art.body };
}

/* ---------- request handling ---------- */

const jsonOut = (obj, status = 200) => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
const noContent = () => ({ status: 204, headers: {}, body: "" });

const VERBOSE = process.env.MOCK_VERBOSE === "1";
function handle(req, res) {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const method = req.method.toUpperCase();
  if (VERBOSE) console.log(`[mock] ${method} ${u.pathname}${u.search}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const q = u.searchParams;
  const seg = path.slice(1).split("/");

  // Jellyfin 12: liking is POST (like) / DELETE (unlike) on /UserFavoriteItems/{id}. The one write the mock remembers.
  const favRoute = path.match(/^\/UserFavoriteItems\/([^/]+)$/);
  if (favRoute && (method === "POST" || method === "DELETE")) {
    setUd(favRoute[1], { IsFavorite: method === "POST" });
    return jsonOut(shapedUserData(favRoute[1]));
  }

  if (method === "POST" || method === "DELETE") {
    // Browsing mock: accept and forget every other write. Playback keeps a device busy but changes nothing.
    if (path === "/Users/AuthenticateByName") return authByName(req, res);
    return noContent();
  }

  if (path === "/" && method === "GET") return jsonOut({ ServerName: SERVER_NAME, mock: true });
  if (path === "/System/Info/Public") return jsonOut({ Id: SERVER_ID, ServerName: SERVER_NAME, Version: "10.11.5" });
  if (path === "/System/Info") return jsonOut({ Id: SERVER_ID, ServerName: SERVER_NAME, Version: "10.11.5" });
  if (path === "/Branding/Configuration") return jsonOut({});
  if (path === "/Users/Public") return jsonOut([]);
  if (path === "/QuickConnect/Enabled") return jsonOut(false);

  // Token-resolved item endpoints (Jellyfin 10.11-style paths used by @jellyfin/sdk 1.x)
  if (path === "/UserItems/Resume") {
    const pool = [...movies, ...episodes].filter((i) => (userData.get(i.Id)?.PlaybackPositionTicks ?? 0) > 0);
    const { page, total } = filterItems(q, pool);
    return jsonOut({ Items: page.map((i) => shape(i, respondOptions(q))), TotalRecordCount: total });
  }
  if (path === "/Items/Latest") {
    const { page } = filterItems(new URLSearchParams({ sortBy: "DateCreated", sortOrder: "Descending" }), [...movies, ...albums]);
    const limit = Number(q.get("limit") ?? 12);
    return jsonOut(page.slice(0, limit).map((i) => shape(i, { ...respondOptions(q) })));
  }
  if (path === "/Items") {
    const type = q.get("includeItemTypes") ?? "";
    if (type.includes("Person")) {
      const people = PEOPLE.map(([name, role], i) => ({ Id: `pe${String(i + 1).padStart(2, "0")}`, Name: name, Type: "Person", Role }));
      const { total, page } = filterItems(q, people);
      return jsonOut({ Items: page.map((p) => shape(p, respondOptions(q))), TotalRecordCount: total });
    }
    const pool = [...movies, ...series, ...seasons, ...episodes, ...albums, ...tracks, ...audioArtists, ...genres, ...playlists];
    const { total, page } = filterItems(q, pool);
    return jsonOut({ Items: page.map((i) => shape(i, respondOptions(q))), TotalRecordCount: total });
  }
  if (path === "/UserImage") {
    const img = avatarSvg();
    return { status: 200, headers: { "content-type": img["content-type"], "cache-control": "private, max-age=1800" }, body: img.body };
  }

  const userRest = seg[0] === "Users" ? seg.slice(2).join("/") : null;
  if (seg[0] === "Users") {
    if (!userRest) return jsonOut({ ...USER, Policy: { IsAdministrator: true, EnableUserAdministration: true } });
    if (userRest === "Views") {
      return jsonOut({ Items: viewsRaw.map((v) => shape(v, {})), TotalRecordCount: viewsRaw.length });
    }
    if (userRest === "Items/Resumable") {
      const pool = [...movies, ...episodes].filter((i) => (userData.get(i.Id)?.PlaybackPositionTicks ?? 0) > 0);
      const { page } = filterItems(q, pool);
      return jsonOut({ Items: page.map((i) => shape(i, { ...respondOptions(q) })), TotalRecordCount: page.length });
    }
    if (userRest === "Items/Latest") {
      const { page } = filterItems(new URLSearchParams({ sortBy: "DateCreated", sortOrder: "Descending" }), [...movies, ...albums]);
      const limit = Number(q.get("limit") ?? 12);
      return jsonOut(page.slice(0, limit).map((i) => shape(i, { ...respondOptions(q) })));
    }
    if (userRest === "Items") {
      const type = q.get("includeItemTypes") ?? "";
      if (type.includes("Person")) {
        const people = PEOPLE.map(([name, role], i) => ({ Id: `pe${String(i + 1).padStart(2, "0")}`, Name: name, Type: "Person", Role }));
        const { total, page } = filterItems(q, people);
        return jsonOut({ Items: page.map((p) => shape(p, respondOptions(q))), TotalRecordCount: total });
      }
      const { total, page } = filterItems(q, [...movies, ...series, ...seasons, ...episodes, ...albums, ...tracks, ...audioArtists, ...genres, ...playlists]);
      return jsonOut({ Items: page.map((i) => shape(i, respondOptions(q))), TotalRecordCount: total });
    }
    const single = userRest.match(/^Items\/([^/]+)$/);
    if (single) {
      const it = byId.get(single[1]);
      return it ? jsonOut(shape(it, { ...respondOptions(q), mediaStreams: true })) : jsonOut({}, 404);
    }
    const fav = userRest.match(/^Favorites\/([^/]+)$/);
    if (fav) {
      const it = byId.get(fav[1]);
      setUd(fav[1], { IsFavorite: true });
      return jsonOut(it ? shape(it, {}) : {});
    }
    const played = userRest.match(/^PlayedItems\/([^/]+)$/);
    if (played) {
      const it = byId.get(played[1]);
      setUd(played[1], { Played: true, PlayCount: Math.max(1, (userData.get(played[1])?.PlayCount ?? 0) + (method === "POST" ? 0 : 0)), LastPlayedDate: daysAgo(0) });
      return jsonOut(it ? shape(it, {}) : {});
    }
  }

  if (seg[0] === "Shows" && seg[1] === "NextUp") {
    const sid = q.get("seriesId");
    const pool = episodes.filter((e) => {
      if (userData.get(e.Id)?.Played) return false;
      if (sid && e.SeriesId !== sid) return false;
      const before = episodes.find((x) => x.SeriesId === e.SeriesId && x.ParentIndexNumber === e.ParentIndexNumber && x.IndexNumber === e.IndexNumber - 1);
      return !!before && !!userData.get(before.Id)?.Played;
    });
    pool.sort((a, b) => Date.parse(userData.get(b.Id)?.LastPlayedDate ?? 0) - Date.parse(userData.get(a.Id)?.LastPlayedDate ?? 0));
    return jsonOut({ Items: pool.slice(0, Number(q.get("limit") ?? 16)).map((i) => shape(i, respondOptions(q))), TotalRecordCount: pool.length });
  }
  if (seg[0] === "Shows" && seg[1] && seg[2] === "Seasons") {
    const list = seasons.filter((s) => s.SeriesId === seg[1] && (q.get("isMissing") ?? "false") === "false");
    return jsonOut({ Items: list.map((s) => shape(s, { images: false, ...respondOptions(q), images: false })), TotalRecordCount: list.length });
  }
  if (seg[0] === "Shows" && seg[1] && seg[2] === "Episodes") {
    let list = episodes.filter((e) => e.SeriesId === seg[1]);
    if (q.get("seasonId")) list = list.filter((e) => e.SeasonId === q.get("seasonId"));
    if ((q.get("sortBy") ?? "") === "Random" && list.length) list = [list[hashNum(q.get("seasonId") ?? seg[1]) % list.length]];
    const start = Number(q.get("startIndex") ?? 0);
    const limit = q.get("limit") ? Number(q.get("limit")) : list.length;
    return jsonOut({ Items: list.slice(start, start + limit).map((e) => shape(e, { ...respondOptions(q), mediaStreams: (q.get("fields") ?? "").includes("MediaStreams") })), TotalRecordCount: list.length });
  }

  if (seg[0] === "Artists" && seg[1] === "AlbumArtists") {
    const shaped = audioArtists.map((a) => shape(a, respondOptions(q)));
    if ((q.get("sortBy") ?? "").includes("PlayCount")) shaped.sort((a, b) => (artistPlay.get(b.Id) ?? 0) - (artistPlay.get(a.Id) ?? 0));
    else shaped.sort((a, b) => (a.Name ?? "").localeCompare(b.Name ?? ""));
    const start = Number(q.get("startIndex") ?? 0);
    const limit = Number(q.get("limit") ?? 300);
    return jsonOut({ Items: shaped.slice(start, start + limit), TotalRecordCount: shaped.length });
  }
  if (seg[0] === "Artists" && !seg[1]) {
    const term = (q.get("searchTerm") ?? "").toLowerCase();
    const list = audioArtists.filter((a) => !term || a.Name.toLowerCase().includes(term));
    return jsonOut({ Items: list.slice(0, Number(q.get("limit") ?? 50)).map((a) => shape(a, respondOptions(q))), TotalRecordCount: list.length });
  }
  if (seg[0] === "Artists" && seg[1]) {
    const artist = audioArtists.find((a) => a.Id === seg[1]);
    if (seg[2] === "Similar") {
      const others = audioArtists.filter((a) => a.Id !== seg[1]).slice(0, Number(q.get("limit") ?? 12));
      return jsonOut({ Items: others.map((a) => shape(a, respondOptions(q))) });
    }
    if (seg[2] === "InstantMix") {
      return jsonOut({ Items: tracks.slice(0, Number(q.get("limit") ?? 60)).map((t) => shape(t, { images: true })) });
    }
    return artist ? jsonOut(shape(artist, respondOptions(q))) : jsonOut({}, 404);
  }

  if (seg[0] === "Genres") {
    const parentId = q.get("parentId");
    const musicMode = parentId === "vw_music";
    const list = genres.filter((g) => (musicMode ? (g.MusicTaggedIds ?? []).length > 0 : movies.some((m) => m.Genres?.includes(g.Name)) || series.some((s) => s.Genres?.includes(g.Name))));
    const shaped = list.map((g) => shape(g, respondOptions(q)));
    shaped.sort((a, b) => (b.SongCount ?? 0) - (a.SongCount ?? 0) || (b.AlbumCount ?? 0) - (a.AlbumCount ?? 0) || (a.Name ?? "").localeCompare(b.Name ?? ""));
    return jsonOut({ Items: shaped, TotalRecordCount: shaped.length });
  }
  if (seg[0] === "MusicGenres" && seg[1] && seg[2] === "InstantMix") {
    return jsonOut({ Items: tracks.slice(0, Number(q.get("limit") ?? 60)).map((t) => shape(t, { images: true })) });
  }

  if (seg[0] === "Items" && seg[1] && !seg[2]) {
    const it = byId.get(seg[1]);
    return it ? jsonOut(shape(it, { ...respondOptions(q), mediaStreams: true })) : jsonOut({}, 404);
  }
  if (seg[0] === "Items" && seg[1] && seg[2] === "Images" && seg[3]) {
    return imageResult(q, seg[1], seg[3]);
  }
  if (seg[0] === "Items" && seg[1] && seg[2] === "Similar") {
    const it = byId.get(seg[1]);
    const pool = it?.Type === "MusicArtist" ? audioArtists.filter((a) => a.Id !== seg[1]) : (it ? [...movies, ...series].filter((m) => m.Type === it.Type && m.Id !== seg[1] && (m.Genres ?? []).some((g) => (it.Genres ?? []).includes(g))) : []);
    return jsonOut({ Items: pool.slice(0, Number(q.get("limit") ?? 12)).map((i) => shape(i, respondOptions(q))), TotalRecordCount: pool.length });
  }
  if (seg[0] === "Items" && seg[1] && seg[2] === "InstantMix") {
    return jsonOut({ Items: tracks.slice(0, Number(q.get("limit") ?? 60)).map((t) => shape(t, { images: true })) });
  }

  if (seg[0] === "Playlists" && seg[1]) {
    const pl = byId.get(seg[1]);
    if (seg[2] === "Items") {
      const entries = pl?.EntryIds ?? [];
      const items = entries.map((id, i) => ({ ...shape(byId.get(id), { images: true }), PlaylistItemId: `pli_${seg[1]}_${i}` }));
      return jsonOut({ Items: items, TotalRecordCount: items.length });
    }
    return jsonOut({});
  }

  if (seg[0] === "QuickConnect") {
    if (seg[1] === "Initiate") return jsonOut({ Code: "4747", Secret: "mock-quickconnect-secret" });
    return jsonOut({ Authenticated: false, Users: [] });
  }

  if (method === "GET" && seg[0] === "Shows" && seg[1] === undefined) return jsonOut({ Items: [], TotalRecordCount: 0 });

  console.log(`[mock] UNHANDLED ${method} ${path}${u.search}`);
  return path.toLowerCase().includes("items") ? jsonOut({ Items: [], TotalRecordCount: 0 }) : jsonOut({});
}

function authByName(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let name = USER.Name;
    try {
      name = JSON.parse(body || "{}")?.Username || USER.Name;
    } catch { /* accept anything */ }
    res.writeHead(200, { "content-type": "application/json", "x-mock": "true" });
    res.end(JSON.stringify({
      User: { Id: USER_ID, Name: String(name).slice(0, 24) || "demo", PrimaryImageTag: "demoavatar", ServerId: SERVER_ID, Policy: { IsAdministrator: true, EnableUserAdministration: true } },
      AccessToken: `mock-token-${String(name).slice(0, 24) || "demo"}`,
      ServerId: SERVER_ID,
      SessionInfo: { UserId: USER_ID, UserName: name, DeviceId: "mock-device" },
    }));
  });
}

const server = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  try {
    const r = handle(req, res);
    if (r && !res.writableEnded) {
      res.writeHead(r.status, { ...r.headers, "x-mock": "true" });
      res.end(r.body ?? "");
    }
  } catch (err) {
    console.error(`[mock] ERROR ${req.method} ${req.url}:`, err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"mock crashed"}');
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock] Jellyfin mock on http://127.0.0.1:${PORT} — sign in as any username (it is shown as-is; use "demo")/any password`);
});