/**
 * Query-key factory. Everything Jellyfin-backed lives under ["jf", ...] so
 * per-user caches can be dropped together; identity changes also do a full
 * reload (see lib/api-client.ts hardNavigate).
 */
export const jfKeys = {
  all: ["jf"] as const,
  item: (id: string) => ["jf", "item", id] as const,
  similar: (id: string) => ["jf", "similar", id] as const,
  home: (section: string) => ["jf", "home", section] as const,
  library: (params: Record<string, unknown>) => ["jf", "library", params] as const,
  genres: (kind: string) => ["jf", "genres", kind] as const,
  counts: ["jf", "counts"] as const,
  seasons: (seriesId: string) => ["jf", "seasons", seriesId] as const,
  episodes: (seriesId: string, seasonId: string) => ["jf", "episodes", seriesId, seasonId] as const,
  nextUp: (seriesId: string) => ["jf", "nextup", seriesId] as const,
};
