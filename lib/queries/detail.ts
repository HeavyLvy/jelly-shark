"use client";

import { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import type { BaseItemDto, ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import { jf } from "@/lib/jellyfin/client";
import { CARD_FIELDS, CARD_IMAGE_TYPES } from "@/lib/jellyfin/fields";
import { jfKeys } from "./keys";
import { useJfQuery } from "./use-jf-query";

/**
 * Data for the movie (/item/[id]) and series (/show/[id]) detail pages.
 * The item itself comes from useItem (a single-item GET returns People,
 * MediaStreams and UserData by default).
 */

const EPISODE_FIELDS: ItemFields[] = ["Overview", "PrimaryImageAspectRatio"];

export const detailKeys = {
  firstEpisode: (seriesId: string) => ["jf", "detail", "first-episode", seriesId] as const,
  collection: (id: string) => ["jf", "detail", "collection", id] as const,
};

/** True when Jellyfin says the id doesn't exist (404) or isn't a valid id (400). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof AxiosError && (error.response?.status === 404 || error.response?.status === 400);
}

async function fetchSeasons(seriesId: string, signal?: AbortSignal): Promise<BaseItemDto[]> {
  return (
    (
      await getShowApi(jf).getSeasons(
        { seriesId, enableUserData: true, enableImages: false, isMissing: false },
        { signal },
      )
    ).data.Items ?? []
  );
}

/** Seasons of a series, in order, with UserData. */
export function useSeasons(seriesId: string | null) {
  return useJfQuery({
    queryKey: jfKeys.seasons(seriesId ?? ""),
    enabled: !!seriesId,
    queryFn: ({ signal }) => fetchSeasons(seriesId ?? "", signal),
  });
}

/** Episodes of one season, with overview, still image and UserData. */
export function useEpisodes(seriesId: string | null, seasonId: string | null) {
  return useJfQuery({
    queryKey: jfKeys.episodes(seriesId ?? "", seasonId ?? ""),
    enabled: !!seriesId && !!seasonId,
    queryFn: async ({ signal }) =>
      (
        await getShowApi(jf).getEpisodes(
          {
            seriesId: seriesId ?? "",
            seasonId: seasonId ?? "",
            fields: EPISODE_FIELDS,
            enableUserData: true,
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            imageTypeLimit: 1,
            isMissing: false,
          },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/** The series' next-up (or in-progress) episode for this user, or null. */
export function useNextUp(seriesId: string | null) {
  return useJfQuery<BaseItemDto | null>({
    queryKey: jfKeys.nextUp(seriesId ?? ""),
    enabled: !!seriesId,
    queryFn: async ({ signal }) =>
      (
        await getShowApi(jf).getNextUp(
          {
            seriesId: seriesId ?? "",
            limit: 1,
            enableUserData: true,
            enableImages: false,
            enableTotalRecordCount: false,
            enableResumable: true,
          },
          { signal },
        )
      ).data.Items?.[0] ?? null,
  });
}

/**
 * First episode of the first regular season (season >= 1, falling back to
 * the first season, i.e. specials) with its MediaStreams — the "Play S1:E1"
 * target and the source of the info panel's Audio / Quality rows. Reuses the
 * cached season list so specials sorting first can't hijack the target.
 */
export function useFirstEpisode(seriesId: string | null) {
  const queryClient = useQueryClient();
  return useJfQuery<BaseItemDto | null>({
    queryKey: detailKeys.firstEpisode(seriesId ?? ""),
    enabled: !!seriesId,
    queryFn: async ({ signal }) => {
      const id = seriesId ?? "";
      const seasons = await queryClient.ensureQueryData({
        queryKey: jfKeys.seasons(id),
        queryFn: ({ signal: s }) => fetchSeasons(id, s),
      });
      const season = seasons.find((x) => (x.IndexNumber ?? 0) >= 1) ?? seasons[0];
      if (!season?.Id) return null;
      const eps =
        (
          await getShowApi(jf).getEpisodes(
            { seriesId: id, seasonId: season.Id, limit: 1, fields: ["MediaStreams"], enableImages: false, enableUserData: true, isMissing: false },
            { signal },
          )
        ).data.Items ?? [];
      return eps[0] ?? null;
    },
  });
}

/** Resolves a random playable episode of a series (Shuffle). */
export async function fetchRandomEpisode(seriesId: string): Promise<BaseItemDto | null> {
  const res = await getShowApi(jf).getEpisodes({
    seriesId,
    sortBy: "Random",
    limit: 1,
    isMissing: false,
    enableImages: false,
    enableUserData: false,
  });
  return res.data.Items?.[0] ?? null;
}

/** Children of a collection (BoxSet), oldest first. */
export function useCollectionItems(boxSetId: string | null) {
  return useJfQuery({
    queryKey: detailKeys.collection(boxSetId ?? ""),
    enabled: !!boxSetId,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getItems(
          {
            parentId: boxSetId ?? "",
            fields: CARD_FIELDS,
            enableImageTypes: CARD_IMAGE_TYPES,
            imageTypeLimit: 1,
            enableUserData: true,
            sortBy: ["ProductionYear", "PremiereDate", "SortName"],
            sortOrder: ["Ascending"],
          },
          { signal },
        )
      ).data.Items ?? [],
  });
}
