"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api-client";
import { useSeerrDiscoverPages } from "@/lib/queries/seerr";
import { discoverRow } from "@/lib/seerr/discover";
import type { SeerrDiscoverKind, SeerrItem, SeerrPage } from "@/lib/seerr/types";
import { PosterCardSkeleton } from "@/components/media/cards";
import { SeerrPosterCard } from "./seerr-cards";

const GUTTER = "px-4 sm:px-8 lg:px-11";
const GRID = "poster-grid gap-x-4 gap-y-8 sm:gap-x-5";

/** /discover/<row>: the whole row, loaded a page at a time. */
export function DiscoverRowPage() {
  const { row } = useParams<{ row: string }>();
  const meta = discoverRow(row);
  if (!meta) {
    return (
      <div className={`pt-36 pb-24 ${GUTTER}`}>
        <EmptyState as="h1" title="Nothing here" description="That isn't one of the Discover lists." action={<BackToDiscover />} />
      </div>
    );
  }
  return <ActiveRow kind={meta.kind} title={meta.title} subtitle={meta.subtitle} />;
}

function ActiveRow({ kind, title, subtitle }: { kind: SeerrDiscoverKind; title: string; subtitle: string }) {
  const pages = useSeerrDiscoverPages(kind);
  return <SeerrBrowse title={title} subtitle={subtitle} pages={pages} />;
}

function BackToDiscover() {
  return (
    <Link href="/discover" className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
      Back to Discover
    </Link>
  );
}

/** A heading and a grid of Seerr titles for any paged list, with a Load more button. */
export function SeerrBrowse({ title, subtitle, pages }: { title: string; subtitle?: string; pages: UseInfiniteQueryResult<InfiniteData<SeerrPage>> }) {
  if (pages.isError && !pages.data) return <Problem error={pages.error} onRetry={() => void pages.refetch()} />;
  // The same title can turn up on two pages as the list shifts.
  const seen = new Set<string>();
  const items: SeerrItem[] = [];
  for (const page of pages.data?.pages ?? []) {
    for (const it of page.results) {
      const key = `${it.mediaType}-${it.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(it);
      }
    }
  }
  return (
    <div className={`pt-28 pb-24 ${GUTTER}`}>
      <Link href="/discover" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Discover
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>}
      {pages.isPending ? (
        <div className={`mt-10 ${GRID}`} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <PosterCardSkeleton key={i} fluid />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState className="mt-12" title="Nothing to show" description="Seerr didn't have anything for this list." />
      ) : (
        <>
          <ul className={`mt-10 ${GRID}`} aria-label={title}>
            {items.map((it) => (
              <li key={`${it.mediaType}-${it.id}`}>
                <SeerrPosterCard item={it} fluid />
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col items-center gap-3">
            {pages.isFetchNextPageError && (
              <p role="alert" className="text-sm text-danger">
                Couldn&apos;t load more.
              </p>
            )}
            {pages.hasNextPage ? (
              <Button variant="secondary" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
                {pages.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : (
              <p className="text-sm text-muted">That&apos;s everything.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Problem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : "";
  return (
    <div className={`pt-36 pb-24 ${GUTTER}`}>
      {code === "not_configured" ? (
        <EmptyState as="h1" title="Discover isn't set up" description="An administrator can connect Seerr in Settings." action={<BackToDiscover />} />
      ) : (
        <ErrorState
          as="h1"
          title="Couldn't load this list"
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

