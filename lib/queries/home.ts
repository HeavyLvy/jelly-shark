"use client";

import type { BaseItemDto, ImageType, ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import { CARD_FIELDS, CARD_IMAGE_TYPES } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { jfKeys } from "./keys";
import { useJfQuery } from "./use-jf-query";

/**
 * Home page data. Every hook goes through the browser SDK instance (→ /api/jf
 * proxy) and is gated on the client by useJfQuery.
 */

/** Cards + what the hero needs (overview for the 3-line blurb). */
const HOME_FIELDS: ItemFields[] = [...CARD_FIELDS, "Overview"];

const imageOpts = { enableImageTypes: CARD_IMAGE_TYPES, imageTypeLimit: 1, enableUserData: true } as const;

/** In-progress videos (movies + episodes), most recent first. */
export function useResumeVideos() {
  return useJfQuery({
    queryKey: jfKeys.home("resume"),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getResumeItems(
          { mediaTypes: ["Video"], limit: 16, fields: HOME_FIELDS, enableTotalRecordCount: false, ...imageOpts },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/** Next episode to watch for each series in progress. */
export function useNextUp() {
  return useJfQuery({
    queryKey: jfKeys.home("next-up"),
    queryFn: async ({ signal }) =>
      (
        await getShowApi(jf).getNextUp(
          { limit: 16, fields: HOME_FIELDS, enableResumable: false, enableTotalRecordCount: false, ...imageOpts },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/**
 * Recently added movies and series. Items/Latest groups new episodes under
 * their series, and the grouped series carries the newest episode's
 * DateCreated (that is what drives the "NEW EPS" badge).
 */
export function useLatestVideo() {
  return useJfQuery({
    queryKey: jfKeys.home("latest-video"),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getLatestMedia(
          { includeItemTypes: ["Movie", "Series"], limit: 24, groupItems: true, fields: HOME_FIELDS, ...imageOpts },
          { signal },
        )
      ).data,
  });
}

/* ---------- Most Popular (your plays in a period) ---------- */

export type PopularPeriod = "1w" | "2w" | "1m" | "3m" | "6m" | "1y";

export const POPULAR_PERIODS: { value: PopularPeriod; label: string; days: number }[] = [
  { value: "1w", label: "Past week", days: 7 },
  { value: "2w", label: "Past 2 weeks", days: 14 },
  { value: "1m", label: "Past month", days: 30 },
  { value: "3m", label: "Past 3 months", days: 91 },
  { value: "6m", label: "Past 6 months", days: 182 },
  { value: "1y", label: "Past year", days: 365 },
];

/**
 * Movies and shows you played in the period, most-played first.
 *
 * Jellyfin only keeps per-user all-time play counts and the last played date
 * (period counts need the Playback Reporting plugin), so: an item is in the
 * period when its LastPlayedDate is; it's ranked by its PlayCount, which counts
 * every start (episodes add up to their show), ties broken by most recently played.
 */
export function useMostPopular(period: PopularPeriod, limit = 16) {
  return useJfQuery<BaseItemDto[]>({
    queryKey: [...jfKeys.home("popular"), period, limit],
    queryFn: async ({ signal }) => {
      const api = getLibraryApi(jf);
      const days = POPULAR_PERIODS.find((p) => p.value === period)?.days ?? 14;
      const since = Date.now() - days * 86_400_000;
      // Newest play first. No IsPlayed/IsResumable filter: a short play counts
      // (PlayCount goes up on every start) but is neither finished nor resumable.
      const { data: recent } = await api.getItems(
        {
          includeItemTypes: ["Movie", "Episode"],
          recursive: true,
          sortBy: ["DatePlayed"],
          sortOrder: ["Descending"],
          enableImages: false,
          enableUserData: true,
          enableTotalRecordCount: false,
          limit: 500,
        },
        { signal },
      );

      const scores = new Map<string, { plays: number; last: number }>();
      for (const it of recent.Items ?? []) {
        const last = it.UserData?.LastPlayedDate ? Date.parse(it.UserData.LastPlayedDate) : NaN;
        // Sorted newest first: past the period (or never played) means done.
        if (!(last >= since)) break;
        const key = it.Type === "Episode" ? it.SeriesId : it.Id;
        if (!key) continue;
        const cur = scores.get(key) ?? { plays: 0, last: 0 };
        scores.set(key, { plays: cur.plays + Math.max(1, it.UserData?.PlayCount ?? 0), last: Math.max(cur.last, last) });
      }
      if (scores.size === 0) return [];

      const ranked = [...scores.entries()].sort((a, b) => b[1].plays - a[1].plays || b[1].last - a[1].last).slice(0, limit);
      const ids = ranked.map(([id]) => id);
      const { data } = await api.getItems({ ids, fields: CARD_FIELDS, enableTotalRecordCount: false, ...imageOpts }, { signal });
      const byId = new Map((data.Items ?? []).map((i) => [i.Id ?? "", i]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },
  });
}

export interface Seed {
  id: string;
  name: string;
}

function toSeed(item: BaseItemDto): Seed | null {
  if (item.Type === "Episode" && item.SeriesId) return { id: item.SeriesId, name: item.SeriesName ?? "this show" };
  return item.Id ? { id: item.Id, name: item.Name ?? "this" } : null;
}

const playedAt = (item: BaseItemDto | undefined) =>
  item?.UserData?.LastPlayedDate ? Date.parse(item.UserData.LastPlayedDate) || 0 : 0;

/**
 * The most recently watched movie or series (episodes resolve to their
 * series), counting both finished and in-progress items, or null.
 */
export function useLastPlayedSeed() {
  return useJfQuery<Seed | null>({
    queryKey: jfKeys.home("last-played"),
    queryFn: async ({ signal }) => {
      const lib = getLibraryApi(jf);
      const lean = { enableImages: false, enableUserData: true, enableTotalRecordCount: false, limit: 1 } as const;
      const [played, resume] = await Promise.all([
        lib.getItems(
          { ...lean, includeItemTypes: ["Movie", "Episode"], recursive: true, filters: ["IsPlayed"], sortBy: ["DatePlayed"], sortOrder: ["Descending"] },
          { signal },
        ),
        lib.getResumeItems({ ...lean, mediaTypes: ["Video"] }, { signal }),
      ]);
      const a = played.data.Items?.[0];
      const b = resume.data.Items?.[0];
      const last = a && b ? (playedAt(b) > playedAt(a) ? b : a) : (a ?? b);
      return last ? toSeed(last) : null;
    },
  });
}

export interface JumpBackAlbums {
  albums: BaseItemDto[];
  /** Newest play time (ms) across the albums' tracks, or null when nothing was played. */
  lastPlayed: number | null;
}

const ALBUM_OPTS = {
  fields: ["PrimaryImageAspectRatio", "DateCreated"] as ItemFields[],
  enableImageTypes: ["Primary"] as ImageType[],
  imageTypeLimit: 1,
  enableUserData: true,
  enableTotalRecordCount: false,
};

/**
 * Albums the user played recently, then the newest added. Jellyfin records
 * play dates on Audio tracks, not on MusicAlbum folders, so the play order
 * comes from the user's played tracks.
 */
export function useJumpBackAlbums(limit = 16) {
  return useJfQuery<JumpBackAlbums>({
    queryKey: [...jfKeys.home("albums"), limit],
    queryFn: async ({ signal }) => {
      const api = getLibraryApi(jf);
      const [tracks, recent] = await Promise.all([
        api.getItems(
          {
            includeItemTypes: ["Audio"],
            recursive: true,
            filters: ["IsPlayed"],
            sortBy: ["DatePlayed"],
            sortOrder: ["Descending"],
            limit: 100,
            enableImages: false,
            enableUserData: true,
            enableTotalRecordCount: false,
          },
          { signal },
        ),
        api.getItems(
          { ...ALBUM_OPTS, includeItemTypes: ["MusicAlbum"], recursive: true, sortBy: ["DateCreated", "SortName"], sortOrder: ["Descending", "Ascending"], limit },
          { signal },
        ),
      ]);

      const playOrder: string[] = [];
      let lastPlayed: number | null = null;
      for (const t of tracks.data.Items ?? []) {
        const at = playedAt(t);
        if (at && (lastPlayed === null || at > lastPlayed)) lastPlayed = at;
        if (t.AlbumId && !playOrder.includes(t.AlbumId)) playOrder.push(t.AlbumId);
      }
      const ids = playOrder.slice(0, limit);
      let played: BaseItemDto[] = [];
      if (ids.length > 0) {
        const found = (await api.getItems({ ...ALBUM_OPTS, ids }, { signal })).data.Items ?? [];
        const byId = new Map(found.map((a) => [a.Id ?? "", a]));
        played = ids.flatMap((id) => byId.get(id) ?? []);
      }
      const seen = new Set(played.map((a) => a.Id));
      const albums = [...played, ...(recent.data.Items ?? []).filter((a) => !seen.has(a.Id))].slice(0, limit);
      return { albums, lastPlayed: played.length > 0 ? lastPlayed : null };
    },
  });
}

/**
 * Where the hero's Play button goes for a series: the next-up episode, or
 * the first regular episode when the user hasn't started it. Uses its own
 * key so it can't collide with the show page's next-up cache shape.
 */
export function useSeriesPlayTarget(seriesId: string | null) {
  return useJfQuery<BaseItemDto | null>({
    queryKey: [...jfKeys.home("series-target"), seriesId ?? ""],
    enabled: !!seriesId,
    queryFn: async ({ signal }) => {
      const id = seriesId ?? "";
      const show = getShowApi(jf);
      const next = (
        await show.getNextUp({ seriesId: id, limit: 1, enableImages: false, enableUserData: true, enableTotalRecordCount: false }, { signal })
      ).data.Items?.[0];
      if (next) return next;
      const eps =
        (await show.getEpisodes({ seriesId: id, limit: 8, enableImages: false, enableUserData: true }, { signal })).data.Items ?? [];
      return eps.find((e) => (e.ParentIndexNumber ?? 0) >= 1) ?? eps[0] ?? null;
    },
  });
}
