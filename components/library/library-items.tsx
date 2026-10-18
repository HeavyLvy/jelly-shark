"use client";

import Link from "next/link";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Check } from "lucide-react";
import { ArtFallback, CommunityRating, NewBadge, ProgressBar } from "@/components/media/bits";
import { JfImage } from "@/components/media/jf-image";
import { PosterCard, isWatched } from "@/components/media/cards";
import { useMediaMenu } from "@/components/media/media-menu";
import { POSTER_GRID_SIZES } from "@/lib/ui-config";
import { Skeleton } from "@/components/ui/states";
import { dotJoin, formatRating, formatRuntime, formatTimeLeft, formatYears, isRecentlyAdded, playedPercent } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { detailHref } from "@/lib/routes";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Card subline per type: "2024 · 1h 52m", "2019 – 2023 · 4 seasons", "3 items". */
export function itemSubtitle(item: BaseItemDto): string {
  switch (item.Type) {
    case "Series":
      return dotJoin(formatYears(item), item.ChildCount ? plural(item.ChildCount, "season", "seasons") : null);
    case "BoxSet":
      return dotJoin(item.ChildCount ? plural(item.ChildCount, "item", "items") : null, item.ProductionYear);
    default:
      return dotJoin(item.ProductionYear, formatRuntime(item.RunTimeTicks));
  }
}


export function LibraryGridCard({ item, now, preload }: { item: BaseItemDto; now: Date | null; preload?: boolean }) {
  const isNew = now !== null && isRecentlyAdded(item, now);
  return <PosterCard item={item} fluid sizes={POSTER_GRID_SIZES} preload={preload} subtitle={itemSubtitle(item)} badge={isNew ? "New" : null} />;
}

/** Compact list row: small poster, title, year, runtime, rating, watched state. */
export function LibraryListRow({ item, now }: { item: BaseItemDto; now: Date | null }) {
  const name = item.Name ?? "Untitled";
  const pct = playedPercent(item);
  const left = formatTimeLeft(item);
  const played = isWatched(item);
  const rating = formatRating(item.CommunityRating);
  const isNew = now !== null && isRecentlyAdded(item, now);
  const year = item.Type === "Series" ? formatYears(item) : item.ProductionYear;
  const length =
    item.Type === "Series"
      ? item.ChildCount
        ? plural(item.ChildCount, "season", "seasons")
        : null
      : item.Type === "BoxSet"
        ? item.ChildCount
          ? plural(item.ChildCount, "item", "items")
          : null
        : formatRuntime(item.RunTimeTicks);

  const { onContextMenu, menu } = useMediaMenu(item);
  return (
    <>
      <Link
        href={detailHref(item)}
        onContextMenu={onContextMenu}
        className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 rounded-card px-2 py-1.5 transition hover:bg-surface md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_6rem_4.5rem_8rem]"
      >
        <div className="relative aspect-[2/3] w-10 overflow-hidden rounded-[6px] bg-surface ring-1 ring-hairline">
          <JfImage
            image={pickImage(item, "poster")}
            alt=""
            sizes="40px"
            className="absolute inset-0"
            fallback={<ArtFallback title="" className="p-0" />}
          />
          {pct !== null && <ProgressBar percent={pct} className="absolute inset-x-0 bottom-0" />}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text">{name}</span>
            {isNew && <NewBadge label="New" className="shrink-0" />}
          </p>
          {/* Phones: the meta columns collapse into a subline. */}
          <p className="truncate text-xs text-muted md:hidden">{dotJoin(year, length, rating && `★ ${rating}`)}</p>
        </div>
        <span className="hidden text-sm text-text-secondary md:block">{year ?? "—"}</span>
        <span className="hidden text-sm text-text-secondary md:block">{length ?? "—"}</span>
        <span className="hidden text-sm text-text-secondary md:block">
          {rating ? <CommunityRating value={rating} /> : <span aria-label="No rating">—</span>}
        </span>
        <span className="justify-self-end text-xs md:justify-self-start md:text-sm">
          {played ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              Watched
            </span>
          ) : left ? (
            <span className="text-text-secondary">{left}</span>
          ) : (
            <span className="text-muted">
              <span className="hidden md:inline">Unwatched</span>
              <span className="sr-only md:hidden">Unwatched</span>
            </span>
          )}
        </span>
      </Link>
      {menu}
    </>
  );
}

export function ListHeader() {
  return (
    <div
      aria-hidden="true"
      className="hidden grid-cols-[2.5rem_minmax(0,1fr)_7rem_6rem_4.5rem_8rem] gap-4 border-b border-hairline px-2 pb-2 text-xs font-semibold tracking-wide text-muted uppercase md:grid"
    >
      <span />
      <span>Title</span>
      <span>Year</span>
      <span>Length</span>
      <span>Rating</span>
      <span>Status</span>
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-4 px-2 py-2" aria-hidden="true">
      <Skeleton className="aspect-[2/3] w-10 rounded-[6px]" />
      <div>
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="mt-2 h-3 w-1/4" />
      </div>
    </div>
  );
}
