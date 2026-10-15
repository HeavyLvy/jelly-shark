"use client";

import { keepPreviousData, useInfiniteQuery, useQuery, type QueryKey } from "@tanstack/react-query";
import { useIsClient } from "@/lib/use-is-client";

/**
 * During hydration a late-hydrating Suspense boundary can find data already
 * in the (browser-singleton) query cache — e.g. fetched by the nav — while the
 * server rendered the loading state. Report "pending" until mounted so the
 * first client render matches the server HTML.
 */
export function hydrationSafe<R extends { data: unknown; isPending: boolean }>(result: R, isClient: boolean): R {
  if (isClient) return result;
  return { ...result, data: undefined, isPending: true, isSuccess: false, isError: false, error: null, status: "pending" };
}

/**
 * useQuery that only runs in the browser (never during SSR/prerender, where
 * the relative /api/jf URL and the session cookie are unavailable).
 * `enabled` composes with the client gate.
 */
export function useJfQuery<T>(opts: {
  queryKey: QueryKey;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  /** Keep showing the previous key's data while a new key loads. */
  keepPrevious?: boolean;
}) {
  const isClient = useIsClient();
  const result = useQuery({
    queryKey: opts.queryKey,
    queryFn: ({ signal }) => opts.queryFn({ signal }),
    enabled: isClient && (opts.enabled ?? true),
    staleTime: opts.staleTime,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
  return hydrationSafe(result, isClient);
}

/** Offset-paginated variant for large Jellyfin lists (StartIndex/Limit). */
export function useJfInfiniteQuery<TPage extends { Items?: unknown[] | null; TotalRecordCount?: number }>(opts: {
  queryKey: QueryKey;
  pageSize: number;
  queryFn: (ctx: { signal: AbortSignal; startIndex: number }) => Promise<TPage>;
  enabled?: boolean;
  /** Keep showing the previous key's pages while a new key loads. */
  keepPrevious?: boolean;
}) {
  const isClient = useIsClient();
  const result = useInfiniteQuery({
    queryKey: opts.queryKey,
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) => opts.queryFn({ signal, startIndex: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + (p.Items?.length ?? 0), 0);
      const total = last.TotalRecordCount ?? 0;
      return loaded < total && (last.Items?.length ?? 0) > 0 ? loaded : undefined;
    },
    enabled: isClient && (opts.enabled ?? true),
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
  return hydrationSafe(result, isClient);
}
