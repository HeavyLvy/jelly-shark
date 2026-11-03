"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { PosterCardSkeleton } from "@/components/media/cards";
import { MobileBackButton } from "@/components/nav/mobile-back-button";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { seerrImageSrc, useSeerrCredits, useSeerrPerson } from "@/lib/queries/seerr";
import { formatDay } from "@/lib/seerr/format";
import type { SeerrItem, SeerrPersonDetail } from "@/lib/seerr/types";
import { SeerrPosterCard } from "./seerr-cards";
import { TitleProblem } from "./seerr-title-view";

const GUTTER = "px-4 sm:px-8 lg:px-11";

function lifeLine(p: SeerrPersonDetail): string | null {
  const born = formatDay(p.birthday);
  const died = formatDay(p.deathday);
  if (!born && !p.placeOfBirth) return null;
  return [born ? `Born ${born}` : null, p.placeOfBirth ? (born ? `in ${p.placeOfBirth}` : `From ${p.placeOfBirth}`) : null].filter(Boolean).join(" ") + (died ? ` · Died ${died}` : "");
}

/** /request/person/<id>: photo, bio and the movies and shows they're in, laid out like a library person's page. */
export function SeerrPersonView({ id }: { id: number }) {
  const person = useSeerrPerson(id);
  const credits = useSeerrCredits(id);
  const [bioOpen, setBioOpen] = useState(false);

  if (person.isError) return <TitleProblem error={person.error} onRetry={() => void person.refetch()} />;
  if (!person.data) return <PersonSkeleton />;
  const p = person.data;
  const life = lifeLine(p);
  const cast = credits.data?.cast ?? [];
  const crew = credits.data?.crew ?? [];

  return (
    <div className={`pt-28 pb-20 ${GUTTER}`}>
      <title>{`${p.name} · Jelly Shark`}</title>
      <MobileBackButton />
      <header className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
        <div className="relative size-40 shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-hairline sm:size-48">
          {p.profilePath ? (
            // eslint-disable-next-line @next/next/no-img-element -- a headshot served by our own server
            <img src={seerrImageSrc(p.profilePath, "w342")} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-raised text-muted">
              <UserRound className="size-16" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-6xl">{p.name}</h1>
          {life && <p className="mt-2 text-sm text-text-secondary">{life}</p>}
          {p.department && <p className="mt-1 text-sm text-muted">Known for {p.department.toLowerCase()}</p>}
        </div>
      </header>

      {p.biography && (
        <section aria-label="Biography" className="mt-8 max-w-3xl text-[15px] leading-relaxed text-text-secondary">
          <p className={bioOpen ? "whitespace-pre-line" : "line-clamp-4"}>{p.biography}</p>
          {p.biography.length > 280 && (
            <button type="button" onClick={() => setBioOpen((o) => !o)} aria-expanded={bioOpen} className="mt-1 text-sm font-semibold text-text hover:underline">
              {bioOpen ? "Less" : "More"}
            </button>
          )}
        </section>
      )}

      <Credits title="Acting" items={cast} pending={credits.isPending} />
      <Credits title="Crew" items={crew} pending={false} />
      {credits.isError && <ErrorState className="mt-10" title="Couldn't load their titles" action={<Button onClick={() => void credits.refetch()}>Try again</Button>} />}
      {credits.data && cast.length + crew.length === 0 && <EmptyState className="mt-12" title="No titles listed" description={`Seerr doesn't list any movies or shows for ${p.name}.`} />}
    </div>
  );
}

function Credits({ title, items, pending }: { title: string; items: SeerrItem[]; pending: boolean }) {
  if (!pending && items.length === 0) return null;
  return (
    <section aria-label={title} className="mt-12">
      <h2 className="mb-4 font-display text-xl font-bold tracking-tight sm:text-[22px]">{title}</h2>
      <div className="poster-grid gap-x-4 gap-y-6 sm:gap-x-5">{pending ? Array.from({ length: 6 }, (_, i) => <PosterCardSkeleton key={i} fluid />) : items.map((item) => <SeerrPosterCard key={`${item.mediaType}-${item.id}`} item={item} fluid />)}</div>
    </section>
  );
}

function PersonSkeleton() {
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
