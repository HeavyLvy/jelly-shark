"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseItemDto, ItemFields, ItemSortBy, SortOrder } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistApi } from "@jellyfin/sdk/lib/utils/api/artist-api";
import { getInstantMixApi } from "@jellyfin/sdk/lib/utils/api/instant-mix-api";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getPlaylistApi } from "@jellyfin/sdk/lib/utils/api/playlist-api";
import { jf } from "@/lib/jellyfin/client";
import { useJfQuery } from "./use-jf-query";

/** Special playlist id for the user's favourite songs. */
export const LIKED_ID = "liked";

const TRACK_FIELDS: ItemFields[] = ["ParentId", "MediaSourceCount"];
const ALBUM_FIELDS: ItemFields[] = ["ChildCount", "DateCreated", "Genres", "PrimaryImageAspectRatio"];

const k = {
  tracks: (scope: string) => ["jf", "music", "tracks", scope] as const,
  list: (scope: string) => ["jf", "music", "list", scope] as const,
};

async function items(params: Parameters<ReturnType<typeof getLibraryApi>["getItems"]>[0], signal: AbortSignal) {
  return (await getLibraryApi(jf).getItems({ recursive: true, enableTotalRecordCount: false, ...params }, { signal })).data.Items ?? [];
}

/** "Radio": Jellyfin's instant mix seeded by a song, album, artist or playlist. */
export async function fetchRadio(item: BaseItemDto, limit = 80): Promise<BaseItemDto[]> {
  if (!item.Id) return [];
  const { data } = await getInstantMixApi(jf).getInstantMixFromItem({ itemId: item.Id, limit, fields: TRACK_FIELDS });
  return data.Items ?? [];
}

export type AlbumSort = "added" | "name" | "artist" | "year";
export const ALBUM_SORTS: { value: AlbumSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "artist", label: "Artist" },
  { value: "year", label: "Release year" },
];
const ALBUM_SORT_BY: Record<AlbumSort, { sortBy: ItemSortBy[]; sortOrder: SortOrder[] }> = {
  added: { sortBy: ["DateCreated", "SortName"], sortOrder: ["Descending", "Ascending"] },
  name: { sortBy: ["SortName"], sortOrder: ["Ascending"] },
  artist: { sortBy: ["AlbumArtist", "ProductionYear", "SortName"], sortOrder: ["Ascending", "Ascending", "Ascending"] },
  year: { sortBy: ["ProductionYear", "SortName"], sortOrder: ["Descending", "Ascending"] },
};

/** All albums, sorted for the music "Albums" grid. */
export function useAlbumsSorted(sort: AlbumSort, limit = 300) {
  return useJfQuery({
    queryKey: k.list(`albums-${sort}-${limit}`),
    queryFn: ({ signal }) => items({ includeItemTypes: ["MusicAlbum"], ...ALBUM_SORT_BY[sort], limit, fields: ALBUM_FIELDS }, signal),
  });
}

export type ArtistSort = "played" | "name";
export const ARTIST_SORTS: { value: ArtistSort; label: string }[] = [
  { value: "played", label: "Most played" },
  { value: "name", label: "Name" },
];

/** All album artists, sorted for the music "Artists" grid. */
export function useArtistsSorted(sort: ArtistSort, limit = 300) {
  return useJfQuery({
    queryKey: k.list(`artists-${sort}-${limit}`),
    queryFn: async ({ signal }) =>
      (
        await getArtistApi(jf).getAlbumArtists(
          { sortBy: sort === "name" ? ["SortName"] : ["PlayCount", "SortName"], sortOrder: sort === "name" ? ["Ascending"] : ["Descending", "Ascending"], limit, fields: ["ChildCount"], enableTotalRecordCount: false },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/* ---------- sidebar / home ---------- */

export function useMusicPlaylists() {
  return useJfQuery({
    queryKey: ["jf", "playlists", "music-sidebar"],
    queryFn: ({ signal }) => items({ includeItemTypes: ["Playlist"], sortBy: ["DatePlayed", "SortName"], sortOrder: ["Descending", "Ascending"], fields: ["ChildCount"] }, signal),
  });
}

export function useRecentAlbums(limit = 24) {
  return useJfQuery({
    queryKey: k.list(`recent-albums-${limit}`),
    queryFn: ({ signal }) => items({ includeItemTypes: ["MusicAlbum"], sortBy: ["DateCreated", "SortName"], sortOrder: ["Descending", "Ascending"], limit, fields: ALBUM_FIELDS }, signal),
  });
}

export function usePlayedAlbums(limit = 24) {
  return useJfQuery({
    queryKey: k.list(`played-albums-${limit}`),
    queryFn: ({ signal }) => items({ includeItemTypes: ["MusicAlbum"], sortBy: ["DatePlayed", "DateCreated"], sortOrder: ["Descending", "Descending"], limit, fields: ALBUM_FIELDS }, signal),
  });
}

/** Album artists ordered by how much they're played (falls back to name for new users). */
export function useTopArtists(limit = 12) {
  return useJfQuery({
    queryKey: k.list(`top-artists-${limit}`),
    queryFn: async ({ signal }) =>
      (
        await getArtistApi(jf).getAlbumArtists(
          { sortBy: ["PlayCount", "SortName"], sortOrder: ["Descending", "Ascending"], limit, fields: ["ChildCount"], enableTotalRecordCount: false },
          { signal },
        )
      ).data.Items ?? [],
  });
}

/** Most-played songs; for users with no history, recently added songs instead. */
export function useMostPlayedTracks(limit = 7) {
  return useJfQuery({
    queryKey: k.tracks(`most-played-${limit}`),
    queryFn: async ({ signal }) => {
      const played = await items({ includeItemTypes: ["Audio"], filters: ["IsPlayed"], sortBy: ["PlayCount", "DatePlayed"], sortOrder: ["Descending", "Descending"], limit, fields: TRACK_FIELDS }, signal);
      if (played.some((t) => (t.UserData?.PlayCount ?? 0) > 0)) return { kind: "played" as const, tracks: played };
      const recent = await items({ includeItemTypes: ["Audio"], sortBy: ["DateCreated", "SortName"], sortOrder: ["Descending", "Ascending"], limit, fields: TRACK_FIELDS }, signal);
      return { kind: "recent" as const, tracks: recent };
    },
  });
}

/* ---------- album / artist / playlist ---------- */

export function useAlbumTracks(albumId: string) {
  return useJfQuery({
    queryKey: k.tracks(`album-${albumId}`),
    enabled: !!albumId,
    queryFn: ({ signal }) =>
      items({ parentId: albumId, includeItemTypes: ["Audio"], sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"], fields: TRACK_FIELDS }, signal),
  });
}

export function useArtistTopTracks(artistId: string, limit = 10) {
  return useJfQuery({
    queryKey: k.tracks(`artist-top-${artistId}-${limit}`),
    enabled: !!artistId,
    queryFn: ({ signal }) =>
      items({ includeItemTypes: ["Audio"], artistIds: [artistId], sortBy: ["PlayCount", "CommunityRating", "SortName"], sortOrder: ["Descending", "Descending", "Ascending"], limit, fields: TRACK_FIELDS }, signal),
  });
}

/** Every track by an artist (for "Play" / "Shuffle" on the artist page). */
export async function fetchArtistTracks(artistId: string): Promise<BaseItemDto[]> {
  return (
    (
      await getLibraryApi(jf).getItems({
        recursive: true,
        includeItemTypes: ["Audio"],
        artistIds: [artistId],
        sortBy: ["Album", "ParentIndexNumber", "IndexNumber"],
        fields: TRACK_FIELDS,
        enableTotalRecordCount: false,
      })
    ).data.Items ?? []
  );
}

export function useArtistAlbums(artistId: string) {
  return useJfQuery({
    queryKey: k.list(`artist-albums-${artistId}`),
    enabled: !!artistId,
    queryFn: ({ signal }) =>
      items({ includeItemTypes: ["MusicAlbum"], albumArtistIds: [artistId], sortBy: ["ProductionYear", "PremiereDate", "SortName"], sortOrder: ["Descending", "Descending", "Ascending"], fields: ALBUM_FIELDS }, signal),
  });
}

export function useSimilarArtists(artistId: string) {
  return useJfQuery({
    queryKey: k.list(`similar-artists-${artistId}`),
    enabled: !!artistId,
    queryFn: async ({ signal }) => (await getLibraryApi(jf).getSimilarArtists({ itemId: artistId, limit: 12 }, { signal })).data.Items ?? [],
  });
}

export function usePlaylistTracks(playlistId: string) {
  return useJfQuery({
    queryKey: ["jf", "playlists", "tracks", playlistId],
    enabled: !!playlistId,
    queryFn: async ({ signal }) => {
      if (playlistId === LIKED_ID) {
        return items({ includeItemTypes: ["Audio"], filters: ["IsFavorite"], sortBy: ["SortName"], fields: TRACK_FIELDS }, signal);
      }
      return (await getPlaylistApi(jf).getPlaylistItems({ playlistId, fields: TRACK_FIELDS }, { signal })).data.Items ?? [];
    },
  });
}

/** All tracks of an album / playlist / artist (or Liked Songs), for menus that act on the whole item. */
export async function fetchTracksFor(item: BaseItemDto | { Id: typeof LIKED_ID; Type: "Liked" }): Promise<BaseItemDto[]> {
  const id = item.Id ?? "";
  if (id === LIKED_ID) {
    return (await getLibraryApi(jf).getItems({ recursive: true, includeItemTypes: ["Audio"], filters: ["IsFavorite"], sortBy: ["SortName"], fields: TRACK_FIELDS })).data.Items ?? [];
  }
  switch (item.Type) {
    case "Audio":
      return [item as BaseItemDto];
    case "MusicArtist":
      return fetchArtistTracks(id);
    case "Playlist":
      return (await getPlaylistApi(jf).getPlaylistItems({ playlistId: id, fields: TRACK_FIELDS })).data.Items ?? [];
    default:
      return (
        (
          await getLibraryApi(jf).getItems({
            parentId: id,
            recursive: true,
            includeItemTypes: ["Audio"],
            sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
            fields: TRACK_FIELDS,
          })
        ).data.Items ?? []
      );
  }
}

/** Instant mix seeded by an artist ("Made for you" cards). */
export async function fetchArtistMix(artistId: string): Promise<BaseItemDto[]> {
  return (await getInstantMixApi(jf).getInstantMixFromArtists({ itemId: artistId, limit: 60 })).data.Items ?? [];
}

/* ---------- playlist editing ---------- */

function useInvalidatePlaylists() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["jf", "playlists"] });
}

export function useRenamePlaylist() {
  const qc = useQueryClient();
  const invalidate = useInvalidatePlaylists();
  return useMutation({
    mutationFn: ({ playlistId, name }: { playlistId: string; name: string }) =>
      getPlaylistApi(jf).updatePlaylist({ playlistId, updatePlaylistDto: { Name: name } }),
    onSettled: (_d, _e, { playlistId }) => {
      void invalidate();
      void qc.invalidateQueries({ queryKey: ["jf", "item", playlistId] });
    },
  });
}

export function useDeletePlaylist() {
  const invalidate = useInvalidatePlaylists();
  return useMutation({
    mutationFn: (playlistId: string) => getLibraryApi(jf).deleteItem({ itemId: playlistId }),
    onSettled: () => void invalidate(),
  });
}

export function useRemoveFromPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, entryId }: { playlistId: string; entryId: string }) =>
      getPlaylistApi(jf).removeItemFromPlaylist({ playlistId, entryIds: [entryId] }),
    onMutate: ({ playlistId, entryId }) => {
      const key = ["jf", "playlists", "tracks", playlistId];
      const prev = qc.getQueryData<BaseItemDto[]>(key);
      qc.setQueryData<BaseItemDto[]>(key, (old) => old?.filter((t) => t.PlaylistItemId !== entryId));
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["jf", "playlists"] }),
  });
}

export function useMovePlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, entryId, newIndex }: { playlistId: string; entryId: string; newIndex: number }) =>
      getPlaylistApi(jf).moveItem({ playlistId, itemId: entryId, newIndex }),
    onMutate: ({ playlistId, entryId, newIndex }) => {
      const key = ["jf", "playlists", "tracks", playlistId];
      const prev = qc.getQueryData<BaseItemDto[]>(key);
      qc.setQueryData<BaseItemDto[]>(key, (old) => {
        if (!old) return old;
        const from = old.findIndex((t) => t.PlaylistItemId === entryId);
        if (from < 0) return old;
        const next = [...old];
        const [moved] = next.splice(from, 1);
        next.splice(newIndex, 0, moved);
        return next;
      });
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(ctx.key, ctx.prev),
    onSettled: (_d, _e, { playlistId }) => qc.invalidateQueries({ queryKey: ["jf", "playlists", "tracks", playlistId] }),
  });
}
