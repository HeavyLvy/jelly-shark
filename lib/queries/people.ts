"use client";

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { CARD_FIELDS } from "@/lib/jellyfin/fields";
import { jf } from "@/lib/jellyfin/client";
import { useJfQuery } from "./use-jf-query";

/** Everything in your library a person appears in (movies and shows), newest first. */
export function usePersonCredits(personId: string | null | undefined) {
  return useJfQuery<BaseItemDto[]>({
    queryKey: ["jf", "person-credits", personId ?? ""],
    enabled: !!personId,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getItems(
          {
            personIds: [personId ?? ""],
            includeItemTypes: ["Movie", "Series"],
            recursive: true,
            sortBy: ["ProductionYear", "PremiereDate", "SortName"],
            sortOrder: ["Descending", "Descending", "Ascending"],
            fields: CARD_FIELDS,
            enableImageTypes: ["Primary"],
            imageTypeLimit: 1,
            enableUserData: true,
            enableTotalRecordCount: false,
          },
          { signal },
        )
      ).data.Items ?? [],
  });
}
