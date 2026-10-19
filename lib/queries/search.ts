"use client";

import { useMemo } from "react";
import type { BaseItemDto, BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistApi } from "@jellyfin/sdk/lib/utils/api/artist-api";
import { getGenreApi } from "@jellyfin/sdk/lib/utils/api/genre-api";
import { getInstantMixApi } from "@jellyfin/sdk/lib/utils/api/instant-mix-api";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getUserViewApi } from "@jellyfin/sdk/lib/utils/api/user-view-api";
import { CARD_FIELDS } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { rankEntries, scoreName, toEntry, type SearchEntry } from "@/lib/search-fuzzy";
import { useJfQuery } from "./use-jf-query";

/** Result groups the search pages can ask for. */
export type SearchGroup = "movies" | "series" | "episodes" | "songs" | "albums" | "artists" | "playlists";

const GROUP_TYPES: Record<Exclude<SearchGroup, "artists">, BaseItemKind[]> = {
  movies: ["Movie"],
  series: ["Series"],
  episodes: ["Episode"],
  songs: ["Audio"],
  albums: ["MusicAlbum"],
  playlists: ["Playlist"],
};

async function searchGroup(group: SearchGroup, term: string, limit: number, signal: AbortSignal): Promise<BaseItemDto[]> {
  if (group === "artists") {
    return (
      (await getArtistApi(jf).getArtists({ searchTerm: term, limit, fields: ["ChildCount"], enableTotalRecordCount: false }, { signal })).data.Items ?? []
    );
  }
  return (
    (
      await getLibraryApi(jf).getItems(
        {
          searchTerm: term,
          recursive: true,
          includeItemTypes: GROUP_TYPES[group],
          limit,
          fields: [...CARD_FIELDS, "Overview", "ParentId"],
          enableTotalRecordCount: false,
        },
        { signal },
      )
    ).data.Items ?? []
  );
}

const FULL_FIELDS = [...CARD_FIELDS, "Overview", "ParentId"] as const;

/* ---------- local title index (typo-tolerant matching) ---------- */

/** Libraries bigger than this (per group) skip the local index and rely on Jellyfin's own search. */
const INDEX_CAP = 40_000;
const INDEX_PAGE = 5_000;

interface TitleIndex {
  entries: SearchEntry[];
}

/** Light-weight list of every title in a group: just enough to match typos and punctuation locally. */
async function buildIndex(group: SearchGroup, signal: AbortSignal): Promise<TitleIndex> {
  const entries: SearchEntry[] = [];
  for (let start = 0; start < INDEX_CAP; ) {
    const page =
      group === "artists"
        ? (await getArtistApi(jf).getArtists({ startIndex: start, limit: INDEX_PAGE, enableImages: false, enableUserData: false, enableTotalRecordCount: true }, { signal })).data
        : (
            await getLibraryApi(jf).getItems(
              {
                includeItemTypes: GROUP_TYPES[group],
                recursive: true,
                startIndex: start,
                limit: INDEX_PAGE,
                enableImages: false,
                enableUserData: false,
                enableTotalRecordCount: true,
              },
              { signal },
            )
          ).data;
    const items = page.Items ?? [];
    for (const it of items) {
      if (!it.Id) continue;
      const primary = group === "songs" ? it.Artists?.[0] ?? it.AlbumArtist : group === "episodes" ? it.SeriesName : group === "albums" ? it.AlbumArtist : null;
      entries.push(toEntry(it.Id, it.Name, primary, group === "songs" ? it.Album : null));
    }
    start += items.length;
    if (items.length === 0 || start >= (page.TotalRecordCount ?? 0)) break;
  }
  return { entries };
}

/** Every title of one group, fetched once and kept for a while. */
function useTitleIndex(group: SearchGroup, enabled: boolean) {
  return useJfQuery({
    queryKey: ["jf", "search-index", group],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => buildIndex(group, signal),
  });
}

/** Start building the indexes that are cheap, so the first search is already forgiving. */
export function useWarmSearchIndex(enabled: boolean) {
  useTitleIndex("movies", enabled);
  useTitleIndex("series", enabled);
  useTitleIndex("artists", enabled);
  useTitleIndex("albums", enabled);
}

/** Songs and episodes can be tens of thousands of rows, so a search never waits for their index. */
const BLOCKING: SearchGroup[] = ["movies", "series", "artists", "albums", "playlists"];

async function fetchByIds(ids: string[], signal: AbortSignal): Promise<BaseItemDto[]> {
  const items = (await getLibraryApi(jf).getItems({ ids, fields: [...FULL_FIELDS], enableTotalRecordCount: false }, { signal })).data.Items ?? [];
  const order = new Map(ids.map((id, i) => [id, i]));
  return items.sort((a, b) => (order.get(a.Id ?? "") ?? 0) - (order.get(b.Id ?? "") ?? 0));
}

/**
 * One search group (movies, songs, …): the closest title matches from the
 * local index (ignores case, spaces, symbols and small typos), then whatever
 * else Jellyfin's own search finds (plot text, people…). Keeps the previous
 * results while a new term loads.
 */
export function useSearchGroup(group: SearchGroup, term: string, limit: number, enabled = true) {
  const q = term.trim();
  const on = enabled && q.length > 0;
  const server = useJfQuery({
    queryKey: ["jf", "search", group, q.toLowerCase(), limit],
    enabled: on,
    keepPrevious: true,
    staleTime: 60_000,
    queryFn: ({ signal }) => searchGroup(group, q, limit, signal),
  });
  const index = useTitleIndex(group, on);
  const hitIds = useMemo(() => (on && index.data ? rankEntries(index.data.entries, q, limit).map((e) => e.id) : []), [on, index.data, q, limit]);
  const hits = useJfQuery({
    queryKey: ["jf", "search-hits", group, hitIds.join(",")],
    enabled: hitIds.length > 0,
    keepPrevious: true,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchByIds(hitIds, signal),
  });

  const data = useMemo(() => {
    if (server.data === undefined && hits.data === undefined) return undefined;
    const seen = new Set<string>();
    const out: BaseItemDto[] = [];
    // Hits belong to the current term only: placeholder data from an older term must not leak in.
    const fresh = hitIds.length > 0 ? hits.data?.filter((h) => h.Id && hitIds.includes(h.Id)) : [];
    for (const it of [...(fresh ?? []), ...(server.data ?? [])]) {
      if (!it.Id || seen.has(it.Id)) continue;
      seen.add(it.Id);
      out.push(it);
    }
    return out.slice(0, limit);
  }, [server.data, hits.data, hitIds, limit]);

  const waitingOnIndex = on && BLOCKING.includes(group) && index.isPending;
  const waitingOnHits = hitIds.length > 0 && hits.data === undefined && !hits.isError;
  return {
    data,
    isPending: server.isPending || waitingOnIndex || waitingOnHits,
    isError: server.isError,
  };
}

/** People (actors, directors…) whose name matches. Jellyfin's own search only. */
export function usePeopleSearch(term: string, limit: number, enabled = true) {
  const q = term.trim();
  return useJfQuery({
    queryKey: ["jf", "search-people", q.toLowerCase(), limit],
    enabled: enabled && q.length > 0,
    keepPrevious: true,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      (await getLibraryApi(jf).getItems({ searchTerm: q, recursive: true, includeItemTypes: ["Person"], limit, enableTotalRecordCount: false }, { signal })).data.Items ?? [],
  });
}

/** Everything the user has marked as a favorite (capped), for the Favorites filter. */
export function useFavoriteItems(enabled = true) {
  return useJfQuery({
    queryKey: ["jf", "favorites", "all"],
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getItems(
          {
            filters: ["IsFavorite"],
            recursive: true,
            includeItemTypes: ["Movie", "Series", "Episode", "Audio", "MusicAlbum", "MusicArtist", "BoxSet"],
            fields: [...FULL_FIELDS],
            limit: 500,
            enableTotalRecordCount: false,
          },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/** Video genres for the "Browse all" grid. */
export function useBrowseGenres() {
  return useJfQuery({
    queryKey: ["jf", "genres", "browse-all"],
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) =>
      (await getGenreApi(jf).getGenres({ includeItemTypes: ["Movie", "Series"], sortBy: ["SortName"], enableTotalRecordCount: false }, { signal })).data.Items ?? [],
  });
}

/**
 * Music genres for the music search "Browse" grid, biggest first.
 *
 * Jellyfin keeps music genres as their own MusicGenre items; /Genres only
 * returns them when scoped to a music library (`parentId`), which is what
 * jellyfin-web does. Genres that tag nothing are dropped. Many genres tag
 * albums but no songs (common with MusicBrainz tags), so callers must not
 * rely on an instant mix alone: see `fetchGenreTracks`.
 */
export function useMusicGenres() {
  return useJfQuery({
    queryKey: ["jf", "genres", "music-browse"],
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const views = (await getUserViewApi(jf).getUserViews({}, { signal })).data.Items ?? [];
      const music = views.filter((v) => v.CollectionType === "music" && v.Id);
      const lists = await Promise.all(
        music.map(async (v) => (await getGenreApi(jf).getGenres({ parentId: v.Id, fields: ["ItemCounts"], enableTotalRecordCount: false }, { signal })).data.Items ?? []),
      );
      // Merge across music libraries by name (Jellyfin already folds case).
      const byName = new Map<string, BaseItemDto>();
      for (const g of lists.flat()) {
        const key = (g.Name ?? "").toLowerCase();
        const prev = byName.get(key);
        if (!prev) byName.set(key, g);
        else byName.set(key, { ...prev, SongCount: (prev.SongCount ?? 0) + (g.SongCount ?? 0), AlbumCount: (prev.AlbumCount ?? 0) + (g.AlbumCount ?? 0) });
      }
      return [...byName.values()]
        .filter((g) => (g.SongCount ?? 0) + (g.AlbumCount ?? 0) > 0)
        .sort((a, b) => (b.SongCount ?? 0) - (a.SongCount ?? 0) || (b.AlbumCount ?? 0) - (a.AlbumCount ?? 0) || (a.Name ?? "").localeCompare(b.Name ?? ""));
    },
  });
}

/**
 * Tracks for a genre tile. Song-tagged genres use Jellyfin's instant mix;
 * album-only genres (no songs carry the tag) play their albums' tracks shuffled.
 */
export async function fetchGenreTracks(genre: BaseItemDto, limit = 80): Promise<BaseItemDto[]> {
  if (!genre.Id) return [];
  if ((genre.SongCount ?? 0) > 0) {
    const { data } = await getInstantMixApi(jf).getInstantMixFromMusicGenreById({ id: genre.Id, limit });
    if (data.Items?.length) return data.Items;
  }
  const lib = getLibraryApi(jf);
  const albums = (await lib.getItems({ genreIds: [genre.Id], includeItemTypes: ["MusicAlbum"], recursive: true, enableImages: false, enableTotalRecordCount: false, limit: 200 })).data.Items ?? [];
  const albumIds = albums.flatMap((a) => (a.Id ? [a.Id] : []));
  if (albumIds.length === 0) return [];
  const { data } = await lib.getItems({ albumIds, includeItemTypes: ["Audio"], recursive: true, sortBy: ["Random"], fields: CARD_FIELDS, enableTotalRecordCount: false, limit });
  return data.Items ?? [];
}

/* ---------- top result ---------- */

/** True when the item's name matches the term (vs. matching on other metadata). */
export function isTitleMatch(item: BaseItemDto, term: string): boolean {
  return scoreName(item.Name, term) > 0;
}

/**
 * Best single result across groups: highest name-match score, ties broken by
 * the order the groups are listed in (most relevant kind first).
 */
export function pickTopResult(term: string, groups: (BaseItemDto[] | undefined)[]): BaseItemDto | null {
  let best: BaseItemDto | null = null;
  let bestScore = 0;
  for (const list of groups) {
    for (const item of list ?? []) {
      const s = scoreName(item.Name, term);
      if (s > bestScore) {
        best = item;
        bestScore = s;
      }
    }
  }
  return best ?? groups.find((g) => g && g.length > 0)?.[0] ?? null;
}
