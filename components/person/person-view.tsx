"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { UserRound } from "lucide-react";
import { PosterCard, PosterCardSkeleton } from "@/components/media/cards";
import { JfImage } from "@/components/media/jf-image";
import { MobileBackButton } from "@/components/nav/mobile-back-button";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { dotJoin, formatYears, typeLabel } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { useItem } from "@/lib/queries/items";
import { usePersonCredits } from "@/lib/queries/people";
import { useIsClient } from "@/lib/use-is-client";
import { POSTER_GRID_SIZES } from "@/lib/ui-config";

const GUTTER = "px-4 sm:px-8 lg:px-11";

function lifeLine(p: BaseItemDto): string | null {
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null);
  const born = fmt(p.PremiereDate);
  const died = fmt(p.EndDate);
  const place = p.ProductionLocations?.[0];
  if (!born && !place) return null;
  return [born ? `Born ${born}` : null, place ? (born ? `in ${place}` : `From ${place}`) : null].filter(Boolean).join(" ") + (died ? ` · Died ${died}` : "");
}

export function PersonView() {
  const { id } = useParams<{ id: string }>();
  const isClient = useIsClient();
  const person = useItem(id);
  const credits = usePersonCredits(id);
  const [bioOpen, setBioOpen] = useState(false);

  if (!isClient || person.isPending) return <PersonSkeleton />;
  if (person.isError || !person.data) {
    return (
      <div className={`pt-28 ${GUTTER}`}>
        <MobileBackButton />
        <ErrorState title="Couldn't load this person" action={<Button onClick={() => void person.refetch()}>Try again</Button>} />
      </div>
    );
  }
  const p = person.data;
  const life = lifeLine(p);
  const movies = credits.data?.filter((c) => c.Type === "Movie") ?? [];
  const shows = credits.data?.filter((c) => c.Type === "Series") ?? [];

  return (
    <div className={`pt-28 pb-20 ${GUTTER}`}>
      <MobileBackButton />
      <header className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div className="relative size-40 shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-hairline sm:size-48">
          <JfImage
            image={pickImage(p, "poster")}
            alt=""
            sizes="192px"
            preload
            className="absolute inset-0"
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-surface-raised text-muted">
                <UserRound className="size-16" aria-hidden="true" />
              </div>
            }
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-6xl">{p.Name}</h1>
          {life && <p className="mt-2 text-sm text-text-secondary">{life}</p>}
          {credits.data && <p className="mt-1 text-sm text-muted">{dotJoin(movies.length ? `${movies.length} movie${movies.length === 1 ? "" : "s"}` : null, shows.length ? `${shows.length} show${shows.length === 1 ? "" : "s"}` : null)} in your library</p>}
        </div>
      </header>

      {p.Overview && (
        <section aria-label="Biography" className="mt-8 max-w-3xl text-[15px] leading-relaxed text-text-secondary">
          <p className={bioOpen ? "whitespace-pre-line" : "line-clamp-4"}>{p.Overview}</p>
          {p.Overview.length > 280 && (
            <button type="button" onClick={() => setBioOpen((o) => !o)} aria-expanded={bioOpen} className="mt-1 text-sm font-semibold text-text hover:underline">
              {bioOpen ? "Less" : "More"}
            </button>
          )}
        </section>
      )}

      <Credits title="Movies" items={movies} pending={credits.isPending} />
      <Credits title="TV Shows" items={shows} pending={credits.isPending} />
      {credits.isError && <ErrorState className="mt-10" title="Couldn't load their titles" action={<Button onClick={() => void credits.refetch()}>Try again</Button>} />}
      {credits.data && credits.data.length === 0 && <EmptyState className="mt-12" title="Nothing in your library yet" description={`When titles with ${p.Name} are added to Jellyfin, they'll show up here.`} />}
    </div>
  );
}

function Credits({ title, items, pending }: { title: string; items: BaseItemDto[]; pending: boolean }) {
  if (!pending && items.length === 0) return null;
  return (
    <section aria-label={title} className="mt-12">
      <h2 className="mb-4 font-display text-xl font-bold tracking-tight sm:text-[22px]">{title}</h2>
      <div className="poster-grid gap-x-4 gap-y-6 sm:gap-x-5">
        {pending
          ? Array.from({ length: 6 }, (_, i) => <PosterCardSkeleton key={i} fluid />)
          : items.map((item) => (
              <PosterCard key={item.Id} item={item} fluid sizes={POSTER_GRID_SIZES} subtitle={dotJoin(typeLabel(item), item.Type === "Series" ? formatYears(item) : item.ProductionYear)} />
            ))}
      </div>
    </section>
  );
}

export function PersonSkeleton() {
  return (
    <div className={`pt-28 ${GUTTER}`} aria-hidden="true">
      <MobileBackButton />
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
        <Skeleton className="size-40 rounded-full sm:size-48" />
        <div className="space-y-3">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="mt-8 h-4 w-full max-w-3xl" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-3xl" />
    </div>
  );
}
