"use client";

import Link from "next/link";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Heart, Music2 } from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { cn } from "@/components/ui/cn";
import { pickImage } from "@/lib/jellyfin/images";
import { useToggleFavorite } from "@/lib/queries/items";
import { usePlayer } from "@/lib/player/store";

/** Square artwork for a track/album (falls back to the album's art, then a note glyph). */
export function TrackArt({ item, size, className }: { item: BaseItemDto; size: number; className?: string }) {
  return (
    <JfImage
      image={pickImage(item, "square")}
      alt=""
      sizes={`${size}px`}
      className={cn("shrink-0 rounded-[6px] bg-surface-raised", className)}
      fallback={
        <div className="absolute inset-0 flex items-center justify-center text-muted">
          <Music2 className="size-1/2" aria-hidden="true" />
        </div>
      }
    />
  );
}

/** Artist names as links (falls back to plain text when Jellyfin gives no ids). */
export function ArtistLinks({ item, className }: { item: BaseItemDto; className?: string }) {
  const artists = item.ArtistItems?.length ? item.ArtistItems : item.AlbumArtists ?? [];
  if (artists.length === 0) return <span className={className}>{item.AlbumArtist ?? item.Artists?.join(", ") ?? ""}</span>;
  return (
    <span className={className}>
      {artists.map((a, i) => (
        <span key={a.Id ?? i}>
          {i > 0 && ", "}
          {a.Id ? (
            <Link href={`/music/artist/${a.Id}`} className="hover:text-text hover:underline">
              {a.Name}
            </Link>
          ) : (
            a.Name
          )}
        </span>
      ))}
    </span>
  );
}

/** ♡ for a track/album/artist; keeps the player queue's copy in sync. */
export function LikeButton({ item, className, size = "md" }: { item: BaseItemDto & { IsFavorite?: boolean }; className?: string; size?: "sm" | "md" }) {
  const toggle = useToggleFavorite();
  const setFavorite = usePlayer((s) => s.setFavorite);
  const liked = item.UserData?.IsFavorite ?? item.IsFavorite ?? false;
  const label = `${liked ? "Remove" : "Save"} ${item.Name ?? "item"} ${liked ? "from" : "to"} Liked`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={liked}
      onClick={() => {
        if (!item.Id) return;
        setFavorite(item.Id, !liked);
        toggle.mutate({ item, favorite: !liked });
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition hover:text-text",
        size === "sm" ? "size-8" : "size-9",
        liked ? "text-accent" : "text-muted",
        className,
      )}
    >
      <Heart className={cn(size === "sm" ? "size-4" : "size-[18px]", liked && "fill-current")} aria-hidden="true" />
    </button>
  );
}
