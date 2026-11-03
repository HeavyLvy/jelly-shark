/** What Jelly Shark's own /api/seerr routes send to the browser. Trimmed down from Seerr's much larger replies. */

export type SeerrMediaType = "movie" | "tv";

/** Where a title stands in Seerr: nothing yet, asked for, being fetched, some of it in the library, or all of it. */
export type SeerrStatus = "none" | "pending" | "processing" | "partial" | "available";

export interface SeerrItem {
  id: number;
  mediaType: SeerrMediaType;
  title: string;
  year: string | null;
  overview: string;
  /** TMDB poster file name like `/abc123.jpg`, loaded through /api/seerr/image. */
  posterPath: string | null;
  status: SeerrStatus;
}

export interface SeerrSeason {
  number: number;
  name: string;
  episodeCount: number;
  status: SeerrStatus;
}

export interface SeerrDetail {
  item: SeerrItem;
  /** TV only: the seasons (not Specials) and which can still be requested. */
  seasons: SeerrSeason[];
}

export interface SeerrSearchResult {
  results: SeerrItem[];
}

export interface SeerrRequestBody {
  mediaType: SeerrMediaType;
  mediaId: number;
  /** TV only. */
  seasons?: number[];
}

export interface SeerrRequestResult {
  /** `pending` waits for approval; `processing` was approved straight away. */
  status: "pending" | "processing";
}

/** Whether a season or title can still be asked for. */
export function isRequestable(status: SeerrStatus): boolean {
  return status === "none" || status === "partial";
}

export interface LinkRow {
  jellyfinUserId: string;
  jellyfinName: string;
  /** The Seerr account this person acts as, or null when they have none yet. */
  seerrUserId: number | null;
  /** `manual`: an administrator chose it. `auto`: matched by Jellyfin id. `none`: no account yet (one is created on their first request). */
  source: "manual" | "auto" | "none";
}

export interface SeerrLinks {
  links: LinkRow[];
  seerrUsers: { id: number; name: string }[];
}
