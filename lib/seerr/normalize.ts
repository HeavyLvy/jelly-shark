import type { SeerrCredits, SeerrDetail, SeerrEpisode, SeerrItem, SeerrMediaType, SeerrPerson, SeerrPersonDetail, SeerrSeason, SeerrStatus } from "./types";

/** Pure helpers that turn Seerr's replies into the small shapes in ./types. */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Seerr's media status numbers: 2 pending, 3 processing, 4 partially available, 5 available; the rest mean nothing is happening. */
export function mapMediaStatus(n: unknown): SeerrStatus {
  switch (n) {
    case 2:
      return "pending";
    case 3:
      return "processing";
    case 4:
      return "partial";
    case 5:
      return "available";
    default:
      return "none";
  }
}

/** Only plain TMDB file names pass, since they end up in an image URL. */
export function safePosterPath(v: unknown): string | null {
  return typeof v === "string" && /^\/[A-Za-z0-9_-]{1,80}\.(?:jpg|png)$/.test(v) ? v : null;
}

/** A search result or detail from Seerr as a SeerrItem; null for people and anything unexpected. */
export function normalizeItem(raw: unknown): SeerrItem | null {
  if (!isObj(raw)) return null;
  const mediaType = raw.mediaType === "movie" || raw.mediaType === "tv" ? (raw.mediaType as SeerrMediaType) : null;
  const id = raw.id;
  if (!mediaType || typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  const title = str(mediaType === "movie" ? raw.title : raw.name);
  if (!title) return null;
  const date = str(mediaType === "movie" ? raw.releaseDate : raw.firstAirDate);
  const media = isObj(raw.mediaInfo) ? raw.mediaInfo : null;
  return {
    id,
    mediaType,
    title,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : null,
    overview: str(raw.overview).slice(0, 1200),
    posterPath: safePosterPath(raw.posterPath),
    status: mapMediaStatus(media?.status),
  };
}

const RANK: SeerrStatus[] = ["none", "pending", "processing", "partial", "available"];
const best = (a: SeerrStatus, b: SeerrStatus): SeerrStatus => (RANK.indexOf(a) >= RANK.indexOf(b) ? a : b);

/**
 * A show's seasons (Specials left out), each with the best of what Seerr knows:
 * the media's own season status, and any request for it that wasn't declined.
 */
export function normalizeSeasons(raw: unknown): SeerrSeason[] {
  if (!isObj(raw)) return [];
  const media = isObj(raw.mediaInfo) ? raw.mediaInfo : null;
  const mediaSeasons = arr(media?.seasons).filter(isObj);
  const requests = arr(media?.requests).filter(isObj);
  const out: SeerrSeason[] = [];
  for (const s of arr(raw.seasons)) {
    if (!isObj(s) || typeof s.seasonNumber !== "number" || !Number.isInteger(s.seasonNumber) || s.seasonNumber < 1) continue;
    const number = s.seasonNumber;
    let status = mapMediaStatus(mediaSeasons.find((m) => m.seasonNumber === number)?.status);
    for (const r of requests) {
      if (r.status === 3) continue; // declined
      if (arr(r.seasons).some((rs) => isObj(rs) && rs.seasonNumber === number)) status = best(status, r.status === 1 ? "pending" : "processing");
    }
    out.push({ number, name: str(s.name) || `Season ${number}`, episodeCount: typeof s.episodeCount === "number" ? s.episodeCount : 0, status });
  }
  return out.sort((a, b) => a.number - b.number);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const date = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const strings = (v: unknown, key: string, max: number): string[] =>
  arr(v)
    .map((x) => (isObj(x) ? str(x[key]) : ""))
    .filter(Boolean)
    .slice(0, max);

/**
 * TMDB image fields are usually a file name (`/abc.jpg`), but some (a season's episode
 * stills) arrive as a full URL. Either way only the plain file name is kept.
 */
export function imageFileName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const last = v.split("/").filter(Boolean).pop();
  return last ? safePosterPath(`/${last}`) : null;
}

function normalizePeople(list: unknown, roleKey: string, max: number): SeerrPerson[] {
  const out: SeerrPerson[] = [];
  const seen = new Set<number>();
  for (const p of arr(list)) {
    if (!isObj(p) || typeof p.id !== "number" || seen.has(p.id)) continue;
    const name = str(p.name);
    if (!name) continue;
    seen.add(p.id);
    out.push({ id: p.id, name, role: str(p[roleKey]) || null, profilePath: safePosterPath(p.profilePath) });
    if (out.length >= max) break;
  }
  return out;
}

/** The age rating for a region (US first, else the first one given). */
function certificationOf(raw: Raw, type: SeerrMediaType): string | null {
  if (type === "movie") {
    const results = arr(isObj(raw.releases) ? raw.releases.results : null).filter(isObj);
    const pick = (r: Raw) => arr(r.release_dates).filter(isObj).map((d) => str(d.certification)).find(Boolean) ?? null;
    const us = results.find((r) => r.iso_3166_1 === "US");
    return (us ? pick(us) : null) ?? results.map(pick).find(Boolean) ?? null;
  }
  const results = arr(isObj(raw.contentRatings) ? raw.contentRatings.results : null).filter(isObj);
  return str(results.find((r) => r.iso_3166_1 === "US")?.rating) || results.map((r) => str(r.rating)).find(Boolean) || null;
}

function trailerOf(raw: Raw): string | null {
  const v = arr(raw.relatedVideos).filter(isObj).find((x) => x.type === "Trailer" && x.site === "YouTube" && typeof x.key === "string" && /^[\w-]{6,20}$/.test(x.key));
  return v ? `https://www.youtube.com/watch?v=${v.key as string}` : null;
}

function jellyfinIdOf(raw: Raw): string | null {
  const media = isObj(raw.mediaInfo) ? raw.mediaInfo : null;
  const id = media?.jellyfinMediaId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

function homepageOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A movie or show page from Seerr: the title with everything its page shows. */
export function normalizeDetail(raw: unknown, mediaType: SeerrMediaType): SeerrDetail | null {
  if (!isObj(raw)) return null;
  const item = normalizeItem({ ...raw, mediaType });
  if (!item) return null;
  const credits = isObj(raw.credits) ? raw.credits : {};
  const crew = arr(credits.crew).filter(isObj);
  const crewNames = (jobs: string[]) => [...new Set(crew.filter((c) => jobs.includes(str(c.job))).map((c) => str(c.name)).filter(Boolean))].slice(0, 3);
  const next = isObj(raw.nextEpisodeToAir) ? raw.nextEpisodeToAir : null;
  const nextDate = date(next?.airDate);
  const isTv = mediaType === "tv";
  const language = str(raw.originalLanguage);
  return {
    item,
    tagline: str(raw.tagline).trim() || null,
    backdropPath: safePosterPath(raw.backdropPath),
    runtime: !isTv && (num(raw.runtime) ?? 0) > 0 ? num(raw.runtime) : null,
    genres: strings(raw.genres, "name", 6),
    rating: (num(raw.voteAverage) ?? 0) > 0 ? num(raw.voteAverage) : null,
    certification: certificationOf(raw, mediaType),
    date: date(isTv ? raw.firstAirDate : raw.releaseDate),
    lastDate: isTv ? date(raw.lastAirDate) : null,
    statusText: str(raw.status) || null,
    originalLanguage: /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : null,
    studios: strings(raw.productionCompanies, "name", 4),
    networks: strings(raw.networks, "name", 4),
    budget: (num(raw.budget) ?? 0) > 0 ? num(raw.budget) : null,
    revenue: (num(raw.revenue) ?? 0) > 0 ? num(raw.revenue) : null,
    creators: strings(raw.createdBy, "name", 3),
    directors: crewNames(["Director"]),
    writers: crewNames(["Screenplay", "Writer", "Story"]),
    cast: normalizePeople(credits.cast, "character", 24),
    trailerUrl: trailerOf(raw),
    homepage: homepageOf(raw.homepage),
    numberOfSeasons: isTv ? num(raw.numberOfSeasons) : null,
    numberOfEpisodes: isTv ? num(raw.numberOfEpisodes) : null,
    nextEpisode: next && nextDate && typeof next.seasonNumber === "number" && typeof next.episodeNumber === "number" ? { season: next.seasonNumber, episode: next.episodeNumber, airDate: nextDate } : null,
    jellyfinId: jellyfinIdOf(raw),
    seasons: isTv ? normalizeSeasons(raw) : [],
  };
}

/** Results of a recommendations / similar call; `mediaType` fills in when Seerr leaves it out. */
export function normalizeList(raw: unknown, mediaType: SeerrMediaType): SeerrItem[] {
  const results = isObj(raw) ? arr(raw.results) : [];
  return results.map((r) => normalizeItem(isObj(r) ? { mediaType, ...r } : null)).filter((i): i is SeerrItem => i !== null);
}

/** One season's episodes. */
export function normalizeEpisodes(raw: unknown): SeerrEpisode[] {
  const list = isObj(raw) ? arr(raw.episodes) : [];
  const out: SeerrEpisode[] = [];
  for (const e of list) {
    if (!isObj(e) || typeof e.episodeNumber !== "number") continue;
    out.push({
      number: e.episodeNumber,
      name: str(e.name) || `Episode ${e.episodeNumber}`,
      overview: str(e.overview).slice(0, 1200),
      airDate: date(e.airDate),
      runtime: (num(e.runtime) ?? 0) > 0 ? num(e.runtime) : null,
      stillPath: imageFileName(e.stillPath),
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** A person's page header. */
export function normalizePerson(raw: unknown): SeerrPersonDetail | null {
  if (!isObj(raw) || typeof raw.id !== "number" || !str(raw.name)) return null;
  return {
    id: raw.id,
    name: str(raw.name),
    biography: str(raw.biography).replace(/\u00a0/g, " ").slice(0, 6000),
    birthday: date(raw.birthday),
    deathday: date(raw.deathday),
    placeOfBirth: str(raw.placeOfBirth) || null,
    profilePath: safePosterPath(raw.profilePath),
    department: str(raw.knownForDepartment) || null,
  };
}

/** TMDB lists talk-show and awards-night appearances as acting credits, with the character "Self" or "Himself". */
const APPEARANCE = /(^|\W)(self|himself|herself|themselves)(\W|$)/i;

/**
 * Movies and shows a person is in (best known first, by how many people rated them) and made
 * (newest first), each once. Talk-show appearances are left out unless that would leave almost nothing.
 */
export function normalizeCredits(raw: unknown): SeerrCredits {
  const one = (list: unknown[], order: (a: Raw, b: Raw) => number, max: number): SeerrItem[] => {
    const seen = new Set<string>();
    const out: SeerrItem[] = [];
    for (const c of list.filter(isObj).sort(order)) {
      const item = normalizeItem(c);
      if (!item || seen.has(`${item.mediaType}-${item.id}`)) continue;
      seen.add(`${item.mediaType}-${item.id}`);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  };
  const c = isObj(raw) ? raw : {};
  const known = (a: Raw, b: Raw) => (num(b.voteCount) ?? 0) - (num(a.voteCount) ?? 0) || (num(b.popularity) ?? 0) - (num(a.popularity) ?? 0);
  const newest = (a: Raw, b: Raw) => (date(b.releaseDate) ?? date(b.firstAirDate) ?? "").localeCompare(date(a.releaseDate) ?? date(a.firstAirDate) ?? "");
  const acting = arr(c.cast);
  const roles = acting.filter((x) => !(isObj(x) && APPEARANCE.test(str(x.character))));
  return { cast: one(roles.length >= 4 ? roles : acting, known, 60), crew: one(arr(c.crew), newest, 40) };
}
