"use client";

import Link from "next/link";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Check, Circle, Heart, Info, Play, RotateCcw, Tv } from "lucide-react";
import { FloatingMenu, menuItemCls, useContextMenu } from "@/components/ui/floating-menu";
import { usePlayer } from "@/lib/player/store";
import { useToggleFavorite, useTogglePlayed } from "@/lib/queries/items";
import { detailHref, watchHref } from "@/lib/routes";

type Favoritable = BaseItemDto & { IsFavorite?: boolean };

/**
 * "Add to favorites" / "Remove from favorites" menu row (songs say "Liked
 * Songs", like Spotify). Keeps the music player's queue copy in sync too.
 */
export function FavoriteMenuItem({ item, onDone }: { item: Favoritable; onDone: () => void }) {
  const toggle = useToggleFavorite();
  const fav = item.UserData?.IsFavorite ?? item.IsFavorite ?? false;
  const song = item.Type === "Audio";
  const label = fav ? (song ? "Remove from Liked Songs" : "Remove from favorites") : song ? "Save to Liked Songs" : "Add to favorites";
  return (
    <button
      type="button"
      role="menuitem"
      className={menuItemCls}
      onClick={() => {
        if (!item.Id) return;
        usePlayer.getState().setFavorite(item.Id, !fav);
        toggle.mutate({ item, favorite: !fav });
        onDone();
      }}
    >
      <Heart className={fav ? "size-4 fill-current text-accent" : "size-4"} aria-hidden="true" /> {label}
    </button>
  );
}

/** Right-click menu for movies, shows, episodes and collections. */
function MediaMenuBody({ item, onClose }: { item: BaseItemDto; onClose: () => void }) {
  const played = useTogglePlayed();
  const playable = (item.Type === "Movie" || item.Type === "Episode") && !!item.Id;
  const inProgress = (item.UserData?.PlaybackPositionTicks ?? 0) > 0 && !item.UserData?.Played;
  const watched = !!item.UserData?.Played;
  const canMarkWatched = item.Type === "Movie" || item.Type === "Episode" || item.Type === "Series" || item.Type === "Season";
  return (
    <>
      {playable && (
        <Link role="menuitem" href={watchHref(item.Id ?? "")} className={menuItemCls} onClick={onClose}>
          <Play className="size-4" aria-hidden="true" /> {inProgress ? "Resume" : "Play"}
        </Link>
      )}
      {playable && inProgress && (
        <Link role="menuitem" href={`${watchHref(item.Id ?? "")}?t=0`} className={menuItemCls} onClick={onClose}>
          <RotateCcw className="size-4" aria-hidden="true" /> Play from beginning
        </Link>
      )}
      <FavoriteMenuItem item={item} onDone={onClose} />
      {canMarkWatched && (
        <button
          type="button"
          role="menuitem"
          className={menuItemCls}
          onClick={() => {
            played.mutate({ item, played: !watched });
            onClose();
          }}
        >
          {watched ? <Circle className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {watched ? "Mark as unwatched" : "Mark as watched"}
        </button>
      )}
      <div role="separator" className="my-1 h-px bg-hairline" />
      {item.Type === "Episode" && item.SeriesId && (
        <Link role="menuitem" href={`/show/${item.SeriesId}`} className={menuItemCls} onClick={onClose}>
          <Tv className="size-4" aria-hidden="true" /> Go to show
        </Link>
      )}
      {item.Type !== "Episode" && (
        <Link role="menuitem" href={detailHref(item)} className={menuItemCls} onClick={onClose}>
          <Info className="size-4" aria-hidden="true" /> {item.Type === "Series" ? "Open show" : "More info"}
        </Link>
      )}
    </>
  );
}

/**
 * Right-click menu for a movie/show card. Render `menu` next to the card's
 * link, not inside it: React events bubble through portals, so a menu inside
 * the <Link> would also trigger the link.
 */
export function useMediaMenu(item: BaseItemDto) {
  const { anchor, onContextMenu, close } = useContextMenu();
  const menu = anchor ? (
    <FloatingMenu anchor={anchor} onClose={close} label={item.Name ?? "item"}>
      <MediaMenuBody item={item} onClose={close} />
    </FloatingMenu>
  ) : null;
  return { onContextMenu, menu };
}
