"use client";

import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
  ItemFilter,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getGenreApi } from "@jellyfin/sdk/lib/utils/api/genre-api";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { CARD_FIELDS } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { jfKeys } from "./keys";
import { useJfInfiniteQuery, useJfQuery } from "./use-jf-query";

/* ---------- URL vocabulary (kept in one place so the view and links agree) ---------- */

export type LibraryKind = "movies" | "tv" | "collections";
export type LibrarySort = "recent" | "name" | "year" | "rating" | "runtime";
export type LibraryFilter = "unwatched" | "watched" | "favorites" | "inprogress";
export type LibraryView = "grid" | "list";

export const LIBRARY_KINDS: { value: LibraryKind; label: string; itemType: BaseItemKind; singular: string; plural: string }[] = [
  { value: "movies", label: "Movies", itemType: "Movie", singular: "movie", plural: "movies" },
  { value: "tv", label: "TV Shows", itemType: "Series", singular: "show", plural: "shows" },
  { value: "collections", label: "Collections", itemType: "BoxSet", singular: "collection", plural: "collections" },
];

export const LIBRARY_SORTS: { value: LibrarySort; label: string; sortBy: ItemSortBy[]; sortOrder: SortOrder[] }[] = [
  { value: "recent", label: "Recently added", sortBy: ["DateCreated", "SortName"], sortOrder: ["Descending", "Ascending"] },
  { value: "name", label: "Name", sortBy: ["SortName"], sortOrder: ["Ascending"] },
  { value: "year", label: "Year", sortBy: ["ProductionYear", "PremiereDate", "SortName"], sortOrder: ["Descending", "Descending", "Ascending"] },
  { value: "rating", label: "Rating", sortBy: ["CommunityRating", "SortName"], sortOrder: ["Descending", "Ascending"] },
  { value: "runtime", label: "Runtime", sortBy: ["Runtime", "SortName"], sortOrder: ["Descending", "Ascending"] },
];

export const LIBRARY_FILTERS: { value: LibraryFilter; label: string; filter: ItemFilter }[] = [
  { value: "unwatched", label: "Unwatched", filter: "IsUnplayed" },
  { value: "watched", label: "Watched", filter: "IsPlayed" },
  { value: "favorites", label: "Favorites", filter: "IsFavorite" },
  { value: "inprogress", label: "In progress", filter: "IsResumable" },
];

/** "#" means names before "A" (digits, punctuation). */
export const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] as const;

export interface LibraryState {
  kind: LibraryKind;
  genre: string | null;
  sort: LibrarySort;
  filters: LibraryFilter[];
  view: LibraryView;
  letter: string | null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Parses (and sanitizes) the library state from the URL. */
export function parseLibraryState(params: URLSearchParams): LibraryState {
  const filterValues = LIBRARY_FILTERS.map((f) => f.value);
  const filters = (params.get("filters") ?? "")
    .split(",")
    .filter((f): f is LibraryFilter => (filterValues as string[]).includes(f));
  const letter = params.get("letter");
  return {
    kind: oneOf(params.get("type"), LIBRARY_KINDS.map((k) => k.value), "movies"),
    genre: params.get("genre") || null,
    sort: oneOf(params.get("sort"), LIBRARY_SORTS.map((s) => s.value), "recent"),
    filters: Array.from(new Set(filters)),
    view: oneOf(params.get("view"), ["grid", "list"] as const, "grid"),
    letter: letter && (LETTERS as readonly string[]).includes(letter) ? letter : null,
  };
}

/** Serializes state back to a query string, omitting defaults. */
export function libraryQueryString(state: LibraryState): string {
  const p = new URLSearchParams();
  if (state.kind !== "movies") p.set("type", state.kind);
  if (state.genre) p.set("genre", state.genre);
  if (state.sort !== "recent") p.set("sort", state.sort);
  if (state.filters.length) p.set("filters", state.filters.join(","));
  if (state.view !== "grid") p.set("view", state.view);
  if (state.letter) p.set("letter", state.letter);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function kindInfo(kind: LibraryKind) {
  return LIBRARY_KINDS.find((k) => k.value === kind) ?? LIBRARY_KINDS[0];
}

/* ---------- queries ---------- */

export const LIBRARY_PAGE_SIZE = 100;

/** Infinite, offset-paginated item list for the current library state. */
export function useLibraryItems(state: LibraryState) {
  const { itemType } = kindInfo(state.kind);
  const sort = LIBRARY_SORTS.find((s) => s.value === state.sort) ?? LIBRARY_SORTS[0];
  const filters = LIBRARY_FILTERS.filter((f) => state.filters.includes(f.value)).map((f) => f.filter);
  const keyParams = {
    type: itemType,
    genre: state.genre,
    sort: state.sort,
    filters: [...state.filters].sort(),
    letter: state.letter,
  };
  return useJfInfiniteQuery<BaseItemDtoQueryResult>({
    queryKey: jfKeys.library(keyParams),
    pageSize: LIBRARY_PAGE_SIZE,
    queryFn: async ({ signal, startIndex }) =>
      (
        await getLibraryApi(jf).getItems(
          {
            includeItemTypes: [itemType],
            recursive: true,
            startIndex,
            limit: LIBRARY_PAGE_SIZE,
            enableTotalRecordCount: true,
            sortBy: sort.sortBy,
            sortOrder: sort.sortOrder,
            fields: CARD_FIELDS,
            enableImageTypes: ["Primary"],
            imageTypeLimit: 1,
            enableUserData: true,
            filters: filters.length ? filters : undefined,
            genres: state.genre ? [state.genre] : undefined,
            nameStartsWith: state.letter && state.letter !== "#" ? state.letter : undefined,
            nameLessThan: state.letter === "#" ? "A" : undefined,
          },
          { signal },
        )
      ).data,
  });
}

/** Kept outside the ["jf","library"] list prefix so list invalidations don't refetch it. */
export const libraryTotalKey = (itemType: BaseItemKind) => ["jf", "library-total", itemType] as const;

/**
 * Unfiltered total for the header subtitle ("69 movies"). Limit 0: count only.
 * Only needed while a genre/filter/letter narrows the list; otherwise the
 * first page's TotalRecordCount already is the total (pass enabled=false).
 */
export function useLibraryTotal(kind: LibraryKind, enabled = true) {
  const { itemType } = kindInfo(kind);
  return useJfQuery({
    queryKey: libraryTotalKey(itemType),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getItems(
          { includeItemTypes: [itemType], recursive: true, limit: 0, enableTotalRecordCount: true, enableImages: false, enableUserData: false },
          { signal },
        )
      ).data.TotalRecordCount ?? 0,
  });
}

/** Genres that actually occur in this item type. */
export function useLibraryGenres(kind: LibraryKind) {
  const { itemType } = kindInfo(kind);
  return useJfQuery<BaseItemDto[]>({
    queryKey: jfKeys.genres(itemType),
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) =>
      (
        await getGenreApi(jf).getGenres(
          { includeItemTypes: [itemType], sortBy: ["SortName"], sortOrder: ["Ascending"], enableImages: false, enableTotalRecordCount: false },
          { signal },
        )
      ).data.Items ?? [],
  });
}
