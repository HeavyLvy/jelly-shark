import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/** Where a card should navigate for a given item. */
export function detailHref(item: BaseItemDto): string {
  const id = item.Id ?? "";
  switch (item.Type) {
    case "Series":
      return `/show/${id}`;
    case "Season":
      return item.SeriesId ? `/show/${item.SeriesId}?season=${id}` : `/item/${id}`;
    case "Episode":
      return item.SeriesId
        ? `/show/${item.SeriesId}?season=${item.SeasonId ?? ""}#episode-${id}`
        : `/item/${id}`;
    case "MusicAlbum":
      return `/music/album/${id}`;
    case "MusicArtist":
      return `/music/artist/${id}`;
    case "Playlist":
      return `/music/playlist/${id}`;
    case "Person":
      return `/person/${id}`;
    default:
      return `/item/${id}`;
  }
}

/** Full-screen player route for a playable item (movie/episode). */
export function watchHref(itemId: string): string {
  return `/watch/${itemId}`;
}
