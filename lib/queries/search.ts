"use client";

import type { BaseItemDto, BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistApi } from "@jellyfin/sdk/lib/utils/api/artist-api";
import { getGenreApi } from "@jellyfin/sdk/lib/utils/api/genre-api";
import { getInstantMixApi } from "@jellyfin/sdk/lib/utils/api/instant-mix-api";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getUserViewApi } from "@jellyfin/sdk/lib/utils/api/user-view-api";
import { CARD_FIELDS } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
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

/** One search group (movies, songs, …). Keeps the previous results while a new term loads. */
export function useSearchGroup(group: SearchGroup, term: string, limit: number, enabled = true) {
  const q = term.trim();
  return useJfQuery({
    queryKey: ["jf", "search", group, q.toLowerCase(), limit],
    enabled: enabled && q.length > 0,
    keepPrevious: true,
    staleTime: 60_000,
    queryFn: ({ signal }) => searchGroup(group, q, limit, signal),
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

function matchScore(name: string | null | undefined, term: string): number {
  const n = (name ?? "").toLowerCase();
  const t = term.toLowerCase().trim();
  if (!n || !t) return 0;
  if (n === t) return 4;
  if (n.startsWith(t)) return 3;
  if (n.split(/[\s\-–:(),.]+/).some((w) => w.startsWith(t))) return 2;
  if (n.includes(t)) return 1;
  return 0;
}

/** True when the item's name contains the term (vs. matching on other metadata). */
export function isTitleMatch(item: BaseItemDto, term: string): boolean {
  return matchScore(item.Name, term) > 0;
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
      const s = matchScore(item.Name, term);
      if (s > bestScore) {
        best = item;
        bestScore = s;
      }
    }
  }
  return best ?? groups.find((g) => g && g.length > 0)?.[0] ?? null;
}
