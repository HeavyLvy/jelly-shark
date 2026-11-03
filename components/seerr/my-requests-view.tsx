"use client";

import { useState } from "react";
import Link from "next/link";
import { ArtFallback } from "@/components/media/bits";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api-client";
import {
  seerrHref,
  seerrImageSrc,
  useSeerrDetail,
  useSeerrRequests,
} from "@/lib/queries/seerr";
import { watchHref } from "@/lib/routes";
import type { SeerrRequestRow, SeerrRequestState } from "@/lib/seerr/types";
import { useIsClient } from "@/lib/use-is-client";

const GUTTER = "px-4 sm:px-8 lg:px-11";

const STATE_LABEL: Record<SeerrRequestState, string> = {
  waiting: "Waiting for approval",
  approved: "Approved",
  declined: "Declined",
  available: "Available",
};

type Filter = "all" | SeerrRequestState;

/** "Season 2" / "Seasons 1, 2 and 3" for a show request. */
export function seasonsLabel(seasons: number[]): string | null {
  if (seasons.length === 0) return null;
  if (seasons.length === 1) return `Season ${seasons[0]}`;
  if (seasons.length > 4) return `${seasons.length} seasons`;
  return `Seasons ${seasons.slice(0, -1).join(", ")} and ${seasons.at(-1)}`;
}

/** Everything the signed-in person has asked for through Seerr, with where each request stands. */
export function MyRequestsView() {
  const isClient = useIsClient();
  const requests = useSeerrRequests(isClient);
  const [filter, setFilter] = useState<Filter>("all");
  if (!isClient || requests.isPending) return <MyRequestsSkeleton />;
  if (requests.isError)
    return (
      <Problem error={requests.error} onRetry={() => void requests.refetch()} />
    );

  const all = requests.data;
  const count = (s: SeerrRequestState) =>
    all.filter((r) => r.state === s).length;
  const states = (Object.keys(STATE_LABEL) as SeerrRequestState[]).filter(
    (s) => count(s) > 0,
  );
  const active: Filter = filter === "all" || count(filter) > 0 ? filter : "all";
  const shown = active === "all" ? all : all.filter((r) => r.state === active);

  return (
    <div className={`mx-auto max-w-4xl pt-28 pb-20 ${GUTTER}`}>
      <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">
        My requests
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        Movies and shows you&apos;ve asked for, newest first.
      </p>
      {all.length === 0 ? (
        <EmptyState
          className="mt-12"
          title="You haven't requested anything"
          description="Search for a movie or show that isn't in the library and request it."
          action={
            <Link
              href="/search"
              className={buttonClasses({
                variant: "secondary",
                className: "mt-2",
              })}
            >
              Search
            </Link>
          }
        />
      ) : (
        <>
          {states.length > 1 && (
            <div className="-mx-4 mt-6 overflow-x-auto px-4 py-2 sm:mx-0 sm:px-0">
              <SegmentedControl<Filter>
                aria-label="Show requests"
                className="w-max"
                value={active}
                onChange={setFilter}
                segments={[
                  { value: "all", label: `All ${all.length}` },
                  ...states.map((s) => ({
                    value: s,
                    label: `${s === "waiting" ? "Waiting" : STATE_LABEL[s]} ${count(s)}`,
                  })),
                ]}
              />
            </div>
          )}
          <ul className="mt-2 divide-y divide-hairline" aria-label="Requests">
            {shown.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RequestRow({ request: r }: { request: SeerrRequestRow }) {
  const detail = useSeerrDetail(r.mediaType, r.tmdbId);
  const item = detail.data?.item;
  const kind = r.mediaType === "movie" ? "Movie" : "TV show";
  const when = r.createdAt
    ? new Date(r.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const sub = [
    kind,
    item?.year,
    seasonsLabel(r.seasons),
    when && `Requested ${when}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const open = r.jellyfinId
    ? r.mediaType === "movie"
      ? watchHref(r.jellyfinId)
      : `/show/${r.jellyfinId}`
    : null;
  return (
    <li className="flex items-center gap-4 py-3">
      <Link
        href={seerrHref(r.mediaType, r.tmdbId)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-card outline-offset-4"
        aria-label={`${item?.title ?? kind}, ${STATE_LABEL[r.state]}`}
      >
        <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-card bg-surface ring-1 ring-hairline sm:w-16">
          {item?.posterPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- a poster served by our own server
            <img
              src={seerrImageSrc(item.posterPath, "w185")}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : item ? (
            <ArtFallback title={item.title} />
          ) : null}
        </div>
        <div className="min-w-0">
          {item ? (
            <p className="truncate font-medium text-text">{item.title}</p>
          ) : (
            <Skeleton className="h-5 w-40" />
          )}
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{sub}</p>
          <StatePill state={r.state} className="mt-2 sm:hidden" />
        </div>
      </Link>
      <StatePill state={r.state} className="max-sm:hidden" />
      {open && (
        <Link
          href={open}
          className={buttonClasses({
            variant: "primary",
            size: "sm",
            className: "shrink-0",
          })}
        >
          {r.mediaType === "movie" ? "Play" : "Open"}
          <span className="sr-only">{item ? ` ${item.title}` : ""}</span>
        </Link>
      )}
    </li>
  );
}

function StatePill({
  state,
  className,
}: {
  state: SeerrRequestState;
  className?: string;
}) {
  const tone =
    state === "available"
      ? "text-text ring-accent"
      : state === "declined"
        ? "text-danger ring-hairline-strong"
        : "text-text-secondary ring-hairline-strong";
  return (
    <span
      className={cn(
        "w-fit shrink-0 rounded-full bg-bg/60 px-2.5 py-1 text-xs font-semibold ring-1",
        tone,
        className,
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

function Problem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : "";
  return (
    <div className={`pt-28 ${GUTTER}`}>
      {code === "not_configured" ? (
        <EmptyState
          as="h1"
          title="Requests aren't set up"
          description="An administrator can connect Seerr in Settings."
        />
      ) : code === "no_account" ? (
        <EmptyState
          as="h1"
          title="You don't have a Seerr account yet"
          description={error instanceof ApiError ? error.message : undefined}
        />
      ) : (
        <ErrorState
          as="h1"
          title="Couldn't load your requests"
          description="Seerr didn't respond. Check your connection and try again."
          action={
            <button
              type="button"
              onClick={onRetry}
              className={buttonClasses({
                variant: "secondary",
                className: "mt-2",
              })}
            >
              Try again
            </button>
          }
        />
      )}
    </div>
  );
}

export function MyRequestsSkeleton() {
  return (
    <div className={`mx-auto max-w-4xl pt-28 ${GUTTER}`} aria-hidden="true">
      <Skeleton className="h-12 w-64" />
      <div className="mt-10 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="aspect-[2/3] w-14 sm:w-16" />
            <Skeleton className="h-5 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}
