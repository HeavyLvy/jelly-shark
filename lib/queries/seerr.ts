"use client";

import { apiFetch } from "@/lib/api-client";
import type { SeerrDetail, SeerrItem, SeerrMediaType, SeerrSearchResult } from "@/lib/seerr/types";
import { useJfQuery } from "./use-jf-query";

export const seerrKeys = {
  all: ["seerr"] as const,
  status: ["seerr", "status"] as const,
  search: (term: string) => ["seerr", "search", term] as const,
  detail: (type: SeerrMediaType, id: number) => ["seerr", "detail", type, id] as const,
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

/** One title, with a show's seasons and which are already asked for. */
export function useSeerrDetail(type: SeerrMediaType, id: number, enabled: boolean) {
  return useJfQuery<SeerrDetail>({
    queryKey: seerrKeys.detail(type, id),
    queryFn: ({ signal }) => apiFetch<SeerrDetail>(`/api/seerr/${type}/${id}`, { signal }),
    enabled,
    staleTime: 0,
  });
}

/** A poster through our server (the browser never talks to Seerr or TMDB). */
export function seerrPosterSrc(posterPath: string, size: "w185" | "w342" | "w500" = "w342"): string {
  return `/api/seerr/image/${size}${posterPath}`;
}
