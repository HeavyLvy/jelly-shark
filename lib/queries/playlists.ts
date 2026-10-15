"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MediaType } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getPlaylistApi } from "@jellyfin/sdk/lib/utils/api/playlist-api";
import { jf } from "@/lib/jellyfin/client";
import { useJfQuery } from "./use-jf-query";

const playlistKeys = {
  list: (mediaType: string) => ["jf", "playlists", mediaType] as const,
};

/** The user's playlists, optionally filtered to a media type (Video / Audio). */
export function usePlaylists(mediaType?: MediaType, enabled = true) {
  return useJfQuery({
    queryKey: playlistKeys.list(mediaType ?? "all"),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(jf).getItems(
          {
            includeItemTypes: ["Playlist"],
            recursive: true,
            sortBy: ["SortName"],
            mediaTypes: mediaType ? [mediaType] : undefined,
            fields: ["ChildCount"],
          },
          { signal },
        )
      ).data.Items ?? [],
  });
}

export function useAddToPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, ids }: { playlistId: string; ids: string[] }) =>
      getPlaylistApi(jf).addItemToPlaylist({ playlistId, ids }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["jf", "playlists"] }),
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, ids, mediaType }: { name: string; ids: string[]; mediaType: MediaType }) =>
      (await getPlaylistApi(jf).createPlaylist({ createPlaylistDto: { Name: name, Ids: ids, MediaType: mediaType } })).data,
    onSettled: () => qc.invalidateQueries({ queryKey: ["jf", "playlists"] }),
  });
}
