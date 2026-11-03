import type { SeerrDetail, SeerrItem, SeerrMediaType, SeerrSeason, SeerrStatus } from "./types";

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

/** A movie or show page from Seerr: the title plus (for shows) its seasons. */
export function normalizeDetail(raw: unknown, mediaType: SeerrMediaType): SeerrDetail | null {
  const item = normalizeItem(isObj(raw) ? { ...raw, mediaType } : null);
  if (!item) return null;
  return { item, seasons: mediaType === "tv" ? normalizeSeasons(raw) : [] };
}
