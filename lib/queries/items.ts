"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BaseItemDto, UserItemDataDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api/user-data-api";
import { CARD_FIELDS, CARD_IMAGE_TYPES, DETAIL_FIELDS } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { jfKeys } from "./keys";
import { LIKED_BY_ARTIST_KEY } from "./music";
import { useJfQuery } from "./use-jf-query";

/** Full item for detail pages / heroes. */
export function useItem(id: string | null | undefined) {
  return useJfQuery({
    queryKey: jfKeys.item(id ?? ""),
    enabled: !!id,
    queryFn: async ({ signal }) =>
      (await getLibraryApi(jf).getItem({ itemId: id ?? "" }, { signal })).data,
  });
}

/** "More like this" / "Because you watched". */
export function useSimilar(id: string | null | undefined, limit = 16) {
  return useJfQuery({
    queryKey: [...jfKeys.similar(id ?? ""), limit],
    enabled: !!id,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getSimilarItems(
          { itemId: id ?? "", limit, fields: CARD_FIELDS },
          { signal },
        )
      ).data.Items ?? [],
  });
}

export { CARD_FIELDS, CARD_IMAGE_TYPES, DETAIL_FIELDS };

/* ---------- optimistic user-data updates across every cached list ---------- */

type Patch = Partial<UserItemDataDto>;

function patchDeep(value: unknown, id: string, patch: Patch): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const p = patchDeep(v, id, patch);
      if (p !== v) changed = true;
      return p;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.Id === id && "UserData" in obj) {
      return { ...obj, UserData: { ...(obj.UserData as object), ...patch } };
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = patchDeep(v, id, patch);
      if (p !== v) changed = true;
      next[k] = p;
    }
    return changed ? next : value;
  }
  return value;
}

/** Applies a UserData patch to every cached Jellyfin query that contains the item. */
export function patchItemUserData(qc: QueryClient, id: string, patch: Patch) {
  qc.setQueriesData({ queryKey: jfKeys.all }, (old: unknown) => (old === undefined ? old : patchDeep(old, id, patch)));
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, favorite }: { item: BaseItemDto; favorite: boolean }) => {
      const api = getUserDataApi(jf);
      const itemId = item.Id ?? "";
      return (favorite ? await api.markFavoriteItem({ itemId }) : await api.unmarkFavoriteItem({ itemId })).data;
    },
    onMutate: ({ item, favorite }) => {
      if (item.Id) patchItemUserData(qc, item.Id, { IsFavorite: favorite });
    },
    onError: (_e, { item, favorite }) => {
      if (item.Id) patchItemUserData(qc, item.Id, { IsFavorite: !favorite });
    },
    onSuccess: (data, { item }) => {
      if (item.Id) patchItemUserData(qc, item.Id, data);
    },
    // Lists made of favourites gain/lose this item.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: jfKeys.home("favorites") });
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === "library" && (q.queryKey[2] as { type?: string } | undefined)?.type === "favorites" });
      void qc.invalidateQueries({ queryKey: ["jf", "library-total", "favorites"] });
      void qc.invalidateQueries({ queryKey: LIKED_BY_ARTIST_KEY });
    },
  });
}

export function useTogglePlayed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, played }: { item: BaseItemDto; played: boolean }) => {
      const api = getUserDataApi(jf);
      const itemId = item.Id ?? "";
      return (played ? await api.markPlayedItem({ itemId }) : await api.markUnplayedItem({ itemId })).data;
    },
    onMutate: ({ item, played }) => {
      if (item.Id) patchItemUserData(qc, item.Id, { Played: played });
    },
    onError: (_e, { item, played }) => {
      if (item.Id) patchItemUserData(qc, item.Id, { Played: !played });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: jfKeys.all }),
  });
}
