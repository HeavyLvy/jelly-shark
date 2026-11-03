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

export interface SeerrPerson {
  id: number;
  name: string;
  /** The character they play, or their job on the crew. */
  role: string | null;
  profilePath: string | null;
}

/** A movie or show with everything its page shows. */
export interface SeerrDetail {
  item: SeerrItem;
  tagline: string | null;
  backdropPath: string | null;
  /** Movie length in minutes (shows don't have one worth showing). */
  runtime: number | null;
  genres: string[];
  /** Out of 10. */
  rating: number | null;
  /** Age rating such as `PG-13` or `TV-MA` (US). */
  certification: string | null;
  /** Full date, `YYYY-MM-DD`: release (movie) or first air date (show). */
  date: string | null;
  /** Shows: when the latest episode aired, `YYYY-MM-DD`. */
  lastDate: string | null;
  /** Released, Ended, Returning Series, … as TMDB says. */
  statusText: string | null;
  originalLanguage: string | null;
  studios: string[];
  networks: string[];
  budget: number | null;
  revenue: number | null;
  creators: string[];
  directors: string[];
  writers: string[];
  cast: SeerrPerson[];
  /** A YouTube trailer, opened in a new tab. */
  trailerUrl: string | null;
  homepage: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  nextEpisode: { season: number; episode: number; airDate: string } | null;
  /** The Jellyfin item this title is in your library as, when Seerr knows it. */
  jellyfinId: string | null;
  /** TV only: the seasons (not Specials) and which can still be requested. */
  seasons: SeerrSeason[];
}

export interface SeerrEpisode {
  number: number;
  name: string;
  overview: string;
  airDate: string | null;
  /** Minutes. */
  runtime: number | null;
  stillPath: string | null;
}

export interface SeerrPersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  department: string | null;
}

export interface SeerrCredits {
  /** Acting credits, best known first. */
  cast: SeerrItem[];
  /** Everything else (directing, writing…), most recent first. */
  crew: SeerrItem[];
}

/** Where a request stands: waiting for an administrator, approved and on its way, turned down, or in the library. */
export type SeerrRequestState = "waiting" | "approved" | "declined" | "available";

/** One of the signed-in person's requests. The title's name and poster come from its own detail lookup. */
export interface SeerrRequestRow {
  id: number;
  mediaType: SeerrMediaType;
  /** The TMDB id, the same one the title's page uses. */
  tmdbId: number;
  state: SeerrRequestState;
  /** Shows only: the seasons asked for. */
  seasons: number[];
  /** ISO time the request was made. */
  createdAt: string | null;
  /** The Jellyfin item once the title is in the library. */
  jellyfinId: string | null;
}

/** The rows on the Discover page. */
export type SeerrDiscoverKind = "trending" | "movies" | "tv" | "upcoming-movies" | "upcoming-tv";

export interface SeerrGenre {
  id: number;
  name: string;
}

/** One page of a long list (Discover's "See all"). */
export interface SeerrPage {
  results: SeerrItem[];
  page: number;
  totalPages: number;
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
