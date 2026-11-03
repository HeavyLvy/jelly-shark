"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { SeerrCredits, SeerrDiscoverKind, SeerrGenre, SeerrDetail, SeerrEpisode, SeerrItem, SeerrMediaType, SeerrPage, SeerrPersonDetail, SeerrRequestBody, SeerrRequestResult, SeerrRequestRow, SeerrSearchResult } from "@/lib/seerr/types";
import { hydrationSafe, useJfQuery } from "./use-jf-query";
import { useIsClient } from "@/lib/use-is-client";

export const seerrKeys = {
  all: ["seerr"] as const,
  status: ["seerr", "status"] as const,
  requests: ["seerr", "requests"] as const,
  genres: (type: SeerrMediaType) => ["seerr", "genres", type] as const,
  discover: (kind: SeerrDiscoverKind) => ["seerr", "discover", kind] as const,
  search: (term: string) => ["seerr", "search", term] as const,
  detail: (type: SeerrMediaType, id: number) => ["seerr", "detail", type, id] as const,
  related: (type: SeerrMediaType, id: number, kind: string) => ["seerr", "related", type, id, kind] as const,
  episodes: (id: number, season: number) => ["seerr", "episodes", id, season] as const,
  person: (id: number) => ["seerr", "person", id] as const,
  credits: (id: number) => ["seerr", "credits", id] as const,
};

/** Whether this Jelly Shark has Seerr set up (and this person can use it). */
export function useSeerrEnabled(): boolean {
  const q = useJfQuery({
    queryKey: seerrKeys.status,
    queryFn: ({ signal }) => apiFetch<{ enabled: boolean }>("/api/seerr/status", { signal }),
    staleTime: 5 * 60_000,
  });
  return q.data?.enabled === true;
}

/** Titles Seerr can request for a search term. Errors are quiet: the search page just has no extra row. */
export function useSeerrSearch(term: string, enabled: boolean) {
  return useJfQuery<SeerrItem[]>({
    queryKey: seerrKeys.search(term),
    queryFn: async ({ signal }) => (await apiFetch<SeerrSearchResult>(`/api/seerr/search?query=${encodeURIComponent(term)}`, { signal })).results,
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
  });
}

/** One title with everything its page shows. */
export function useSeerrDetail(type: SeerrMediaType, id: number, enabled = true) {
  return useJfQuery<SeerrDetail>({
    queryKey: seerrKeys.detail(type, id),
    queryFn: ({ signal }) => apiFetch<SeerrDetail>(`/api/seerr/${type}/${id}`, { signal }),
    enabled,
    staleTime: 30_000,
  });
}

/** "Recommended" or "Similar" titles for a movie or show. */
export function useSeerrRelated(type: SeerrMediaType, id: number, kind: "recommendations" | "similar") {
  return useJfQuery<SeerrItem[]>({
    queryKey: seerrKeys.related(type, id, kind),
    queryFn: async ({ signal }) => (await apiFetch<SeerrSearchResult>(`/api/seerr/${type}/${id}/${kind}`, { signal })).results,
    staleTime: 10 * 60_000,
  });
}

export function useSeerrEpisodes(id: number, season: number | null) {
  return useJfQuery<SeerrEpisode[]>({
    queryKey: seerrKeys.episodes(id, season ?? 0),
    queryFn: async ({ signal }) => (await apiFetch<{ episodes: SeerrEpisode[] }>(`/api/seerr/tv/${id}/season/${season}`, { signal })).episodes,
    enabled: season !== null,
    staleTime: 10 * 60_000,
  });
}

export function useSeerrPerson(id: number) {
  return useJfQuery<SeerrPersonDetail>({
    queryKey: seerrKeys.person(id),
    queryFn: ({ signal }) => apiFetch<SeerrPersonDetail>(`/api/seerr/person/${id}`, { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useSeerrCredits(id: number) {
  return useJfQuery<SeerrCredits>({
    queryKey: seerrKeys.credits(id),
    queryFn: ({ signal }) => apiFetch<SeerrCredits>(`/api/seerr/person/${id}/credits`, { signal }),
    staleTime: 10 * 60_000,
  });
}

/** One Discover row: trending, popular or upcoming titles. */
export function useSeerrDiscover(kind: SeerrDiscoverKind) {
  return useJfQuery<SeerrItem[]>({
    queryKey: seerrKeys.discover(kind),
    queryFn: async ({ signal }) => (await apiFetch<SeerrSearchResult>(`/api/seerr/discover/${kind}`, { signal })).results,
    staleTime: 10 * 60_000,
  });
}

/** Every page of one Discover row, loaded as you ask for more. */
export function useSeerrDiscoverPages(kind: SeerrDiscoverKind) {
  const isClient = useIsClient();
  const q = useInfiniteQuery({
    queryKey: [...seerrKeys.discover(kind), "pages"],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => apiFetch<SeerrPage>(`/api/seerr/discover/${kind}?page=${pageParam}`, { signal }),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: isClient,
    staleTime: 10 * 60_000,
  });
  return hydrationSafe(q, isClient);
}

/** The genres Seerr can browse for movies or shows. */
export function useSeerrGenres(type: SeerrMediaType) {
  return useJfQuery<SeerrGenre[]>({
    queryKey: seerrKeys.genres(type),
    queryFn: async ({ signal }) => (await apiFetch<{ genres: SeerrGenre[] }>(`/api/seerr/genres/${type}`, { signal })).genres,
    staleTime: 60 * 60_000,
  });
}

/** Every page of the titles in one genre, loaded as you ask for more. */
export function useSeerrGenrePages(type: SeerrMediaType, id: number) {
  const isClient = useIsClient();
  const q = useInfiniteQuery({
    queryKey: ["seerr", "genre", type, id],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => apiFetch<SeerrPage>(`/api/seerr/discover/genre/${type}/${id}?page=${pageParam}`, { signal }),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: isClient,
    staleTime: 10 * 60_000,
  });
  return hydrationSafe(q, isClient);
}

/** The signed-in person's own requests, newest first. */
export function useSeerrRequests(enabled = true) {
  return useJfQuery<SeerrRequestRow[]>({
    queryKey: seerrKeys.requests,
    queryFn: async ({ signal }) => (await apiFetch<{ requests: SeerrRequestRow[] }>("/api/seerr/requests", { signal })).requests,
    enabled,
    staleTime: 30_000,
  });
}

/** Ask for a movie or for seasons of a show. Titles are refetched afterwards so their status updates everywhere. */
export function useSeerrRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SeerrRequestBody) => apiFetch<SeerrRequestResult>("/api/seerr/request", { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: seerrKeys.all }),
  });
}

/** Cancel one of your own requests that is still waiting. Everything Seerr-related refetches afterwards. */
export function useSeerrCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: true }>(`/api/seerr/request/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: seerrKeys.all }),
  });
}

export type SeerrImageSize = "w185" | "w300" | "w342" | "w500" | "w780" | "w1280";

/** A TMDB image through our server (the browser never talks to Seerr or TMDB). `file` is like `/abc.jpg`. */
export function seerrImageSrc(file: string, size: SeerrImageSize = "w342"): string {
  return `/api/seerr/image/${size}${file}`;
}

/** The page for a title or person. */
export function seerrHref(type: SeerrMediaType | "person", id: number): string {
  return `/request/${type}/${id}`;
}
