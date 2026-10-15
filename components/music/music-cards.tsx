"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { AlbumCard } from "@/components/media/cards";
import { FloatingMenu, useContextMenu } from "@/components/ui/floating-menu";
import { LIKED_ID, fetchTracksFor } from "@/lib/queries/music";
import { TrackMenuBody } from "./track-menu";
import { Play, User } from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { pickImage } from "@/lib/jellyfin/images";

/** Round artist tile (mockup "Artists you play most"). */
export function ArtistCard({ item, subtitle = "Artist", className, onContextMenu }: { item: BaseItemDto; subtitle?: string; className?: string; onContextMenu?: MouseEventHandler }) {
  const name = item.Name ?? "Unknown artist";
  return (
    <Link href={`/music/artist/${item.Id}`} onContextMenu={onContextMenu} className={cn("group block w-album shrink-0 rounded-card outline-offset-4", className)}>
      <div className="relative aspect-square overflow-hidden rounded-full bg-surface-raised ring-1 ring-hairline transition group-hover:ring-hairline-strong">
        <JfImage
          image={pickImage(item, "square")}
          alt=""
          sizes="168px"
          className="absolute inset-0"
          imgClassName="transition duration-300 group-hover:scale-[1.04]"
          fallback={
            <div className="absolute inset-0 flex items-center justify-center font-display text-5xl font-extrabold text-text-secondary">
              {name.charAt(0).toUpperCase() || <User className="size-1/3" aria-hidden="true" />}
            </div>
          }
        />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-text">{name}</p>
      <p className="truncate text-xs text-muted">{subtitle}</p>
    </Link>
  );
}

export function ArtistCardSkeleton() {
  return (
    <div className="w-album shrink-0" aria-hidden="true">
      <Skeleton className="aspect-square w-full rounded-full" />
      <Skeleton className="mt-2 h-3.5 w-2/3" />
      <Skeleton className="mt-1.5 h-3 w-1/3" />
    </div>
  );
}

/** Round accent play button used on music headers and cards. */
export function BigPlayButton({ onClick, label, className, size = "lg" }: { onClick: () => void; label: string; className?: string; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg shadow-black/40 transition hover:scale-105 hover:brightness-110",
        size === "lg" ? "size-14" : "size-10",
        className,
      )}
    >
      <Play className={cn("translate-x-px fill-current", size === "lg" ? "size-6" : "size-4")} aria-hidden="true" />
    </button>
  );
}

/* ---------- right-click menus for albums / playlists / artists ---------- */

/**
 * Right-click menu for a music item: Play, Shuffle, Play next, Add to queue,
 * Add to playlist, Go to artist. Tracks are resolved on demand.
 * Spread `onContextMenu` on the element and render `menu`.
 */
export function useMusicItemMenu(item: BaseItemDto | { Id: typeof LIKED_ID; Type: "Liked"; Name: string }) {
  const { anchor, onContextMenu, close } = useContextMenu();
  const label = item.Name ?? "item";
  const href =
    item.Id === LIKED_ID
      ? `/music/playlist/${LIKED_ID}`
      : item.Type === "MusicArtist"
        ? `/music/artist/${item.Id}`
        : item.Type === "Playlist"
          ? `/music/playlist/${item.Id}`
          : `/music/album/${item.Id}`;
  const menu = anchor ? (
    <FloatingMenu anchor={anchor} onClose={close} label={label}>
      <TrackMenuBody
        getTracks={() => fetchTracksFor(item)}
        single={item.Id === LIKED_ID ? null : (item as BaseItemDto)}
        playSource={{ label, href }}
        onClose={close}
      />
    </FloatingMenu>
  ) : null;
  return { onContextMenu, menu };
}

/** AlbumCard with a right-click menu (albums & playlists). */
export function MusicAlbumCard(props: Parameters<typeof AlbumCard>[0]) {
  const { onContextMenu, menu } = useMusicItemMenu(props.item);
  return (
    <>
      <AlbumCard {...props} onContextMenu={onContextMenu} />
      {menu}
    </>
  );
}

/** ArtistCard with a right-click menu. */
export function MusicArtistCard(props: Parameters<typeof ArtistCard>[0]) {
  const { onContextMenu, menu } = useMusicItemMenu(props.item);
  return (
    <>
      <ArtistCard {...props} onContextMenu={onContextMenu} />
      {menu}
    </>
  );
}
