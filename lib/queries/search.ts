"use client";

import type { BaseItemDto, BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistApi } from "@jellyfin/sdk/lib/utils/api/artist-api";
import { getGenreApi } from "@jellyfin/sdk/lib/utils/api/genre-api";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
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

/** Music genres for the music search "Browse" grid. */
export function useMusicGenres() {
  return useJfQuery({
    queryKey: ["jf", "genres", "music-browse"],
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) =>
      (await getGenreApi(jf).getGenres({ includeItemTypes: ["MusicAlbum", "Audio"], sortBy: ["SortName"], enableTotalRecordCount: false }, { signal })).data.Items ?? [],
  });
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
