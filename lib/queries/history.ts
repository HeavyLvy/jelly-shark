"use client";

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { CARD_FIELDS, CARD_IMAGE_TYPES } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { jfKeys } from "./keys";
import { useJfQuery } from "./use-jf-query";

/**
 * Movies and episodes you've played, most recent first (Jellyfin keeps one
 * LastPlayedDate per item, so each title appears once, at its latest play).
 */
export function useWatchHistory(limit = 200) {
  return useJfQuery<BaseItemDto[]>({
    queryKey: [...jfKeys.home("history"), limit],
    queryFn: async ({ signal }) => {
      const { data } = await getLibraryApi(jf).getItems(
        {
          includeItemTypes: ["Movie", "Episode"],
          recursive: true,
          sortBy: ["DatePlayed"],
          sortOrder: ["Descending"],
          limit,
          fields: CARD_FIELDS,
          enableImageTypes: CARD_IMAGE_TYPES,
          imageTypeLimit: 1,
          enableUserData: true,
          enableTotalRecordCount: false,
        },
        { signal },
      );
      // Never-played items sort last; cut them off.
      return (data.Items ?? []).filter((i) => i.UserData?.LastPlayedDate);
    },
  });
}
