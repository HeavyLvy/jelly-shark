"use client";

import { MusicAlbumCard } from "@/components/music/music-cards";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { ChevronRight } from "lucide-react";
import { AlbumCardSkeleton, LandscapeCard, LandscapeCardSkeleton, PosterCard, PosterCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SelectMenu } from "@/components/ui/select-menu";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { dotJoin, formatYears, isRecentlyAdded, typeLabel } from "@/lib/format";
import { useSimilar } from "@/lib/queries/items";
import {
  useJumpBackAlbums,
  useLastPlayedSeed,
  useLatestVideo,
  useNextUp,
  useMostPopular,
  useResumeVideos,
  POPULAR_PERIODS,
  type Seed,
} from "@/lib/queries/home";
import { setPopularPeriod, usePopularPeriod } from "@/lib/popular-period";
import { useNow } from "@/lib/use-now";

const gutter = "px-4 sm:px-8 lg:px-11";

/* ---------- shared row states ---------- */

type CardShape = "poster" | "landscape" | "album";

function CardSkeleton({ shape }: { shape: CardShape }) {
  switch (shape) {
    case "landscape":
      return <LandscapeCardSkeleton />;
    case "album":
      return <AlbumCardSkeleton />;
    default:
      return <PosterCardSkeleton />;
  }
}

/** Placeholder row shaped like the cards it will hold. */
export function RowSkeleton({
  shape,
  count = 8,
  className,
  gapClassName = "gap-4",
}: {
  shape: CardShape;
  count?: number;
  className?: string;
  gapClassName?: string;
}) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      <div className={cn("mb-3 flex h-8 items-center", gutter)}>
        <Skeleton className="h-5 w-52" />
      </div>
      <div className={cn("flex overflow-hidden pb-2", gapClassName, gutter)}>
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} shape={shape} />
        ))}
      </div>
    </div>
  );
}

/** Compact in-row error with a retry, keeping the row's heading in place. */
export function RowError({ title, onRetry, className }: { title: string; onRetry: () => void; className?: string }) {
  return (
    <section aria-label={title} className={className}>
      <h2 className={cn("mb-3 font-display text-xl font-bold tracking-tight sm:text-[22px]", gutter)}>{title}</h2>
      <div className={gutter}>
        <ErrorState
          as="h3"
          className="items-start gap-2 rounded-card border border-hairline py-6 pl-5 text-left [&>h3]:text-base"
          title={`Couldn't load ${title.toLowerCase()}`}
          description="Jellyfin didn't respond. Check the connection and try again."
          action={
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          }
        />
      </div>
    </section>
  );
}

/* ---------- 1. Continue Watching ---------- */

/** Resume first, then Next Up, one card per series. */
export function mergeContinueWatching(resume: BaseItemDto[], nextUp: BaseItemDto[]): BaseItemDto[] {
  const seen = new Set<string>();
  const out: BaseItemDto[] = [];
  for (const item of [...resume, ...nextUp]) {
    const key = item.Type === "Episode" && item.SeriesId ? `s:${item.SeriesId}` : `i:${item.Id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function ContinueWatchingRow() {
  const resume = useResumeVideos();
  const nextUp = useNextUp();
  const title = "Continue Watching";
  if (resume.isPending || nextUp.isPending) return <RowSkeleton shape="landscape" count={5} />;
  if (resume.isError && nextUp.isError) {
    return (
      <RowError
        title={title}
        onRetry={() => {
          void resume.refetch();
          void nextUp.refetch();
        }}
      />
    );
  }
  const items = mergeContinueWatching(resume.data ?? [], nextUp.data ?? []);
  if (items.length === 0) return null;
  return (
    <MediaRow title={title}>
      {items.map((item) => (
        <RowItem key={item.Id}>
          <LandscapeCard item={item} />
        </RowItem>
      ))}
    </MediaRow>
  );
}

/* ---------- 2. Most Popular ---------- */

export function PopularRowSkeleton() {
  return <RowSkeleton shape="poster" />;
}

/** Your most-played movies and shows in a chosen period (default: past 2 weeks). */
export function PopularRow() {
  const period = usePopularPeriod();
  const popular = useMostPopular(period);
  const title = "Most Popular";
  const periodLabel = POPULAR_PERIODS.find((p) => p.value === period)?.label.toLowerCase() ?? "";
  const picker = <SelectMenu value={period} options={POPULAR_PERIODS} onChange={setPopularPeriod} label="Most popular in" size="sm" />;
  if (popular.isPending) return <PopularRowSkeleton />;
  if (popular.isError) return <RowError title={title} onRetry={() => void popular.refetch()} />;
  const items = popular.data;
  return (
    <MediaRow title={title} subtitle="What you've watched most" action={picker}>
      {items.length === 0 ? (
        <li className="py-6 text-sm text-muted">Nothing watched in the {periodLabel}. Try a longer period.</li>
      ) : (
        items.map((item) => (
          <RowItem key={item.Id}>
            <PosterCard item={item} subtitle={dotJoin(typeLabel(item), item.Type === "Series" ? formatYears(item) : item.ProductionYear)} />
          </RowItem>
        ))
      )}
    </MediaRow>
  );
}

/* ---------- 3. Recently Added ---------- */

/**
 * Items/Latest (groupItems) sets a grouped series' ChildCount to the number
 * of *new* episodes, not its season count, so it only feeds the "new" label.
 */
function recentSubtitle(item: BaseItemDto, recent: boolean): string {
  if (item.Type !== "Series") return dotJoin(typeLabel(item), item.ProductionYear);
  if (!recent) return dotJoin(typeLabel(item), formatYears(item));
  const n = item.ChildCount ?? 0;
  return dotJoin(typeLabel(item), n > 1 ? `${n} new episodes` : "New episodes");
}

export function RecentlyAddedRow() {
  const latest = useLatestVideo();
  const now = useNow();
  const title = "Recently Added";
  if (latest.isPending) return <RowSkeleton shape="poster" />;
  if (latest.isError) return <RowError title={title} onRetry={() => void latest.refetch()} />;
  const items = latest.data;
  if (items.length === 0) return null;
  return (
    <MediaRow title={title} seeAllHref="/library?type=movies&sort=added">
      {items.map((item) => {
        const recent = now !== null && isRecentlyAdded(item, now);
        const isSeries = item.Type === "Series";
        // A grouped series carries its newest episode's DateCreated.
        const badge = recent ? (isSeries ? "New eps" : "New") : null;
        const subtitle = recentSubtitle(item, recent);
        return (
          <RowItem key={item.Id}>
            <PosterCard item={item} badge={badge} subtitle={subtitle} />
          </RowItem>
        );
      })}
    </MediaRow>
  );
}

/* ---------- 4. Because You Watched / More Like ---------- */

/**
 * Seeded by the most recently played movie or series. With no history we
 * fall back to "More Like X" using the first featured hero title, so the
 * row still offers discovery instead of vanishing for new users.
 */
export function BecauseYouWatchedRow({ fallback }: { fallback: Seed | null }) {
  const last = useLastPlayedSeed();
  const seed = last.isSuccess ? (last.data ?? fallback) : null;
  const similar = useSimilar(seed?.id, 16);
  const fromHistory = last.isSuccess && last.data !== null;

  if (last.isPending || (seed && similar.isPending)) return <RowSkeleton shape="poster" />;
  if (last.isError) return <RowError title="Because You Watched" onRetry={() => void last.refetch()} />;
  if (!seed) return null;
  const lead = fromHistory ? "Because You Watched" : "More Like";
  const label = `${lead} ${seed.name}`;
  if (similar.isError) return <RowError title={label} onRetry={() => void similar.refetch()} />;
  const items = similar.data ?? [];
  if (items.length === 0) return null;
  return (
    <MediaRow
      label={label}
      title={
        <>
          {lead} <span className="text-accent">{seed.name}</span>
        </>
      }
    >
      {items.map((item) => (
        <RowItem key={item.Id}>
          <PosterCard item={item} />
        </RowItem>
      ))}
    </MediaRow>
  );
}

/* ---------- 5. Jump Back Into Music ---------- */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function musicSubtitle(lastPlayed: number | null, now: Date | null): string {
  if (lastPlayed === null) return "Recently added albums";
  if (now && now.getTime() - lastPlayed < WEEK_MS) return "Albums and mixes you played this week";
  return "Albums you played recently";
}

/** Raised panel; the descendant selectors inset MediaRow's gutters to the panel padding. */
function MusicPanel({ children }: { children: ReactNode }) {
  return (
    <div className={gutter}>
      <div className="jelly-solid rounded-panel py-6 sm:py-7 [&_section>div:first-child]:px-5 [&_ul]:scroll-px-5 [&_ul]:px-5 sm:[&_section>div:first-child]:px-6 sm:[&_ul]:px-6">
        {children}
      </div>
    </div>
  );
}

const openMusic = (
  <Link href="/music" className={buttonClasses({ variant: "outline", size: "sm", className: "shrink-0" })}>
    <span>
      <span className="hidden sm:inline">Open </span>Music
    </span>
    <ChevronRight className="size-4" aria-hidden="true" />
  </Link>
);

export function MusicRowSkeleton() {
  return (
    <MusicPanel>
      <RowSkeleton shape="album" className="[&>div]:px-5 sm:[&>div]:px-6" />
    </MusicPanel>
  );
}

export function MusicRow() {
  const albums = useJumpBackAlbums(16);
  const now = useNow();
  const title = "Jump Back Into Music";
  if (albums.isPending) return <MusicRowSkeleton />;
  if (albums.isError) {
    return (
      <MusicPanel>
        <RowError title={title} onRetry={() => void albums.refetch()} className="[&>*]:px-5 sm:[&>*]:px-6" />
      </MusicPanel>
    );
  }
  const { albums: items, lastPlayed } = albums.data;
  if (items.length === 0) return null;
  const subtitle = musicSubtitle(lastPlayed, now);
  return (
    <MusicPanel>
      <MediaRow title={title} subtitle={subtitle} action={openMusic}>
        {items.map((album) => (
          <RowItem key={album.Id}>
            <MusicAlbumCard item={album} />
          </RowItem>
        ))}
      </MediaRow>
    </MusicPanel>
  );
}
