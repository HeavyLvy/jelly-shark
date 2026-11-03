"use client";

import { useState } from "react";
import Link from "next/link";
import { PosterCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api-client";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useSeerrDiscover, useSeerrGenres } from "@/lib/queries/seerr";
import { DISCOVER_ROWS } from "@/lib/seerr/discover";
import { useIsClient } from "@/lib/use-is-client";
import { SeerrPosterCard } from "./seerr-cards";

const GUTTER = "px-4 sm:px-8 lg:px-11";

/** Browse what's popular and coming soon, and request it. Every title opens its own page. */
export function DiscoverView() {
  const isClient = useIsClient();
  // Seerr being off or the account missing shows the same on every row, so the first row speaks for all.
  const first = useSeerrDiscover("trending");
  if (!isClient || first.isPending) return <DiscoverSkeleton />;
  if (first.isError) return <Problem error={first.error} onRetry={() => void first.refetch()} />;
  return (
    <div className="pt-28 pb-24">
      <div className={GUTTER}>
        <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">Discover</h1>
        <p className="mt-2 mb-10 text-sm text-text-secondary">Find movies and shows to request.</p>
      </div>
      <div className="flex flex-col gap-12">
        <GenreBrowser />
        {DISCOVER_ROWS.map((row) => (
          <DiscoverRow key={row.kind} {...row} />
        ))}
      </div>
    </div>
  );
}

/** Genre chips for movies or shows; each opens that genre's full list. */
function GenreBrowser() {
  const [type, setType] = useState<"movie" | "tv">("movie");
  const genres = useSeerrGenres(type);
  // No list to browse (Seerr can't say): leave the section out rather than show an empty box.
  if (genres.isError || (genres.data && genres.data.length === 0)) return null;
  return (
    <section aria-label="Browse by genre" className={GUTTER}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-[22px]">Browse by genre</h2>
        <SegmentedControl<"movie" | "tv"> aria-label="Genres for" value={type} onChange={setType} segments={[{ value: "movie", label: "Movies" }, { value: "tv", label: "Shows" }]} />
      </div>
      <ul className="flex flex-wrap gap-2" aria-busy={!genres.data}>
        {genres.data
          ? genres.data.map((g) => (
              <li key={g.id}>
                <Link href={`/discover/genre/${type}/${g.id}`} className="jelly-control inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-text">
                  {g.name}
                </Link>
              </li>
            ))
          : Array.from({ length: 10 }, (_, i) => (
              <li key={i} aria-hidden="true">
                <Skeleton className="h-9 w-24 rounded-full" />
              </li>
            ))}
      </ul>
    </section>
  );
}

function DiscoverRow({ kind, title, subtitle }: (typeof DISCOVER_ROWS)[number]) {
  const q = useSeerrDiscover(kind);
  if (q.isError || (q.data && q.data.length === 0)) return null;
  return (
    <MediaRow title={title} subtitle={subtitle} seeAllHref={`/discover/${kind}`}>
      {q.data
        ? q.data.map((item) => (
            <RowItem key={`${item.mediaType}-${item.id}`}>
              <SeerrPosterCard item={item} />
            </RowItem>
          ))
        : Array.from({ length: 8 }, (_, i) => (
            <RowItem key={i}>
              <PosterCardSkeleton />
            </RowItem>
          ))}
    </MediaRow>
  );
}

function Problem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : "";
  return (
    <div className={`pt-28 ${GUTTER}`}>
      {code === "not_configured" ? (
        <EmptyState as="h1" title="Discover isn't set up" description="An administrator can connect Seerr in Settings." />
      ) : code === "no_account" ? (
        <EmptyState as="h1" title="You don't have a Seerr account yet" description={error instanceof ApiError ? error.message : undefined} />
      ) : (
        <ErrorState
          as="h1"
          title="Couldn't load Discover"
          description="Seerr didn't respond. Check your connection and try again."
          action={
            <button type="button" onClick={onRetry} className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
              Try again
            </button>
          }
        />
      )}
    </div>
  );
}

export function DiscoverSkeleton() {
  return (
    <div className="pt-28" aria-hidden="true">
      <div className={GUTTER}>
        <Skeleton className="h-12 w-56" />
        <Skeleton className="mt-3 mb-10 h-4 w-64" />
      </div>
      <div className={`flex gap-4 overflow-hidden ${GUTTER}`}>
        {Array.from({ length: 8 }, (_, i) => (
          <PosterCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
