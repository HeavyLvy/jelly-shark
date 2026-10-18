"use client";

import Link from "next/link";
import { useMediaMenu } from "./media-menu";
import type { MouseEventHandler, ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Play } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { dotJoin, episodeCode, formatTimeLeft, playedPercent, typeLabel } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { detailHref, watchHref } from "@/lib/routes";
import { POSTER_SIZES } from "@/lib/ui-config";
import { ArtFallback, NewBadge, ProgressBar, WatchedBadge } from "./bits";
import { JfImage } from "./jf-image";

/* Card widths from the design tokens: poster (NEXT_PUBLIC_POSTER_WIDTH, see lib/ui-config.ts), landscape 312, album 168. */

interface PosterCardProps {
  item: BaseItemDto;
  /** Second line under the title; defaults to "Type · Year". */
  subtitle?: ReactNode;
  badge?: string | null;
  /** Grid cards stretch to the column; row cards use the fixed poster width. */
  fluid?: boolean;
  sizes?: string;
  /** Load eagerly (first grid row / above-the-fold LCP candidates). */
  preload?: boolean;
  className?: string;
}

/**
 * Watched check. Jellyfin reports Played=true for a series/collection with
 * no local children, so folders also need every child played.
 */
export function isWatched(item: BaseItemDto): boolean {
  const ud = item.UserData;
  if (!ud?.Played) return false;
  if (item.IsFolder) return (ud.UnplayedItemCount ?? 0) === 0 && (item.RecursiveItemCount ?? item.ChildCount ?? 0) > 0;
  return true;
}

export function PosterCard({ item, subtitle, badge, fluid, sizes = POSTER_SIZES, preload, className }: PosterCardProps) {
  const pct = playedPercent(item);
  const name = item.Name ?? "Untitled";
  const { onContextMenu, menu } = useMediaMenu(item);
  return (
    <>
      <Link
        href={detailHref(item)}
        onContextMenu={onContextMenu}
        className={cn("group block shrink-0 rounded-card outline-offset-4", fluid ? "w-full" : "w-poster", className)}
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
          <JfImage
            image={pickImage(item, "poster")}
            alt=""
            sizes={sizes}
            preload={preload}
            className="absolute inset-0"
            imgClassName="transition duration-300 group-hover:scale-[1.03]"
            fallback={<ArtFallback title={name} />}
          />
          {badge && <NewBadge label={badge} className="absolute top-2.5 left-2.5" />}
          {isWatched(item) && <WatchedBadge className="absolute top-2.5 right-2.5" />}
          {pct !== null && <ProgressBar percent={pct} className="absolute inset-x-0 bottom-0" />}
        </div>
        <p className="mt-2 truncate text-sm font-medium text-text">{name}</p>
        <p className="truncate text-xs text-muted">{subtitle ?? dotJoin(typeLabel(item), item.ProductionYear)}</p>
      </Link>
      {menu}
    </>
  );
}

/** Continue-watching style 16:9 card with progress and time left. */
export function LandscapeCard({ item, sizes = "312px", className }: { item: BaseItemDto; sizes?: string; className?: string }) {
  const pct = playedPercent(item);
  const isEpisode = item.Type === "Episode";
  const title = (isEpisode ? item.SeriesName : item.Name) ?? "Untitled";
  const sub = isEpisode ? dotJoin(episodeCode(item), item.Name) : dotJoin(typeLabel(item), item.ProductionYear);
  const left = formatTimeLeft(item);
  const { onContextMenu, menu } = useMediaMenu(item);
  return (
    <div className={cn("group relative w-landscape shrink-0", className)} onContextMenu={onContextMenu}>
      <Link href={detailHref(item)} className="block rounded-card outline-offset-4">
        <div className="relative aspect-video overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
          <JfImage
            image={pickImage(item, "landscape")}
            alt=""
            sizes={sizes}
            className="absolute inset-0"
            imgClassName="transition duration-300 group-hover:scale-[1.03]"
            fallback={<ArtFallback title={title} />}
          />
          {pct !== null && <ProgressBar percent={pct} className="absolute inset-x-0 bottom-0" />}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-text">{title}</p>
          {left && <p className="shrink-0 text-xs text-muted">{left}</p>}
        </div>
        <p className="truncate text-xs text-muted">{sub}</p>
      </Link>
      {item.Id && (
        <Link
          href={watchHref(item.Id)}
          aria-label={`Play ${title}${isEpisode && item.Name ? `, ${item.Name}` : ""}`}
          className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center jelly-control rounded-full text-text transition hover:bg-accent hover:text-on-accent"
        >
          <Play className="size-3.5 fill-current" aria-hidden="true" />
        </Link>
      )}
      {menu}
    </div>
  );
}

/** Square album card (music rows). */
export function AlbumCard({ item, subtitle, className, onContextMenu }: { item: BaseItemDto; subtitle?: ReactNode; className?: string; onContextMenu?: MouseEventHandler }) {
  const name = item.Name ?? "Untitled";
  return (
    <Link href={detailHref(item)} onContextMenu={onContextMenu} className={cn("group block w-album shrink-0 rounded-card outline-offset-4", className)}>
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
        <JfImage image={pickImage(item, "square")} alt="" sizes="168px" className="absolute inset-0" fallback={<ArtFallback title={name} />} />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-text">{name}</p>
      <p className="truncate text-xs text-muted">{subtitle ?? item.AlbumArtist ?? item.Artists?.[0] ?? ""}</p>
    </Link>
  );
}

/* ---------- skeletons matching card shapes ---------- */

export function PosterCardSkeleton({ fluid }: { fluid?: boolean }) {
  return (
    <div className={cn("shrink-0", fluid ? "w-full" : "w-poster")} aria-hidden="true">
      <Skeleton className="aspect-[2/3] w-full" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      <Skeleton className="mt-1.5 h-3 w-1/2" />
    </div>
  );
}

export function LandscapeCardSkeleton() {
  return (
    <div className="w-landscape shrink-0" aria-hidden="true">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="mt-2 h-3.5 w-2/3" />
      <Skeleton className="mt-1.5 h-3 w-1/3" />
    </div>
  );
}

export function AlbumCardSkeleton() {
  return (
    <div className="w-album shrink-0" aria-hidden="true">
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      <Skeleton className="mt-1.5 h-3 w-1/2" />
    </div>
  );
}
