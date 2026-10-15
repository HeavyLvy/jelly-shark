"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { ChevronLeft } from "lucide-react";
import { CommunityRating, RatingBadge } from "@/components/media/bits";
import { HeroBackdrop, TitleTreatment } from "@/components/media/hero";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { formatRating, formatYears } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";

/**
 * Workaround for a shared JfImage bug: its wrapper always carries `relative`,
 * which beats a caller's `absolute inset-0` in the generated CSS, so every
 * fill image collapses to 0px. This descendant rule restores `absolute` for
 * those wrappers inside the detail pages. Harmless (and removable) once
 * components/media/jf-image.tsx stops hard-coding `relative`.
 */

/** Horizontal page gutter shared with MediaRow. */
export const GUTTER = "px-4 sm:px-8 lg:px-11";

export function backLinkFor(item: BaseItemDto): { href: string; label: string } {
  switch (item.Type) {
    case "Series":
      return { href: "/library?type=tv", label: "TV Shows" };
    case "BoxSet":
      return { href: "/library?type=collections", label: "Collections" };
    default:
      return { href: "/library?type=movies", label: "Movies" };
  }
}

interface DetailHeroProps {
  item: BaseItemDto;
  /** Item whose backdrop to show when `item` has none (e.g. a collection's child). */
  backdropItem?: BaseItemDto;
  /** Extra meta entries after the years (runtime, seasons, "Ends at"…). */
  meta: ReactNode[];
  actions: ReactNode;
  panel: ReactNode;
}

/**
 * Detail hero: full-bleed backdrop, back link, huge title, meta row,
 * overview and actions on the left; floating info card on the right.
 */
export function DetailHero({ item, backdropItem, meta, actions, panel }: DetailHeroProps) {
  const back = backLinkFor(item);
  const years = formatYears(item);
  const rating = formatRating(item.CommunityRating);
  const tagline = item.Taglines?.[0];
  const art = backdropItem ?? item;
  const hasBackdrop = pickImage(art, "backdrop") !== null;
  return (
    <section className="relative isolate overflow-hidden" aria-label="Overview">
      <HeroBackdrop item={art} preload className="-z-10">
        {/* Phones: text spans the full width, so dim the whole backdrop. */}
        <div className="absolute inset-0 bg-bg/55 md:hidden" />
      </HeroBackdrop>
      <div className={`relative flex flex-col gap-8 pt-28 pb-10 ${hasBackdrop ? "min-h-[560px] lg:min-h-[640px]" : "lg:pt-36"} lg:flex-row lg:items-end lg:justify-between lg:gap-12 ${GUTTER}`}>
        <div className="flex max-w-2xl min-w-0 flex-1 flex-col justify-end lg:self-stretch">
          <Link
            href={back.href}
            className="mb-5 inline-flex w-fit items-center gap-1 rounded-full text-sm text-text-secondary transition hover:text-text"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {back.label}
          </Link>
          {/* Logo box overrides target the logo span (not the sr-only name): the
              mockup's title is the hero's dominant element, ~260px tall at 1440. */}
          <TitleTreatment
            item={item}
            className="lg:text-8xl xl:text-[7.25rem] [&>span[aria-hidden]]:h-28 [&>span[aria-hidden]]:max-w-[34rem] sm:[&>span[aria-hidden]]:h-40 lg:[&>span[aria-hidden]]:h-52"
          />
          <ul className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary" aria-label="Title facts">
            {item.OfficialRating && (
              <li>
                <RatingBadge rating={item.OfficialRating} />
              </li>
            )}
            {years && <li>{years}</li>}
            {meta.map((m, i) => (m ? <li key={i}>{m}</li> : null))}
            {rating && (
              <li>
                <CommunityRating value={rating} />
              </li>
            )}
          </ul>
          {tagline && !item.Overview && <p className="mt-4 text-base text-text-secondary italic">{tagline}</p>}
          {item.Overview && (
            <p className="mt-4 line-clamp-4 max-w-[38rem] text-[15px] leading-relaxed text-text-secondary sm:line-clamp-3">{item.Overview}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">{actions}</div>
        </div>
        {panel && <div className="w-full lg:w-[23rem] lg:shrink-0">{panel}</div>}
      </div>
    </section>
  );
}

/** Shape-matching placeholder for the hero (+ optional episode rows). */
export function DetailSkeleton({ variant }: { variant: "movie" | "show" }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading title…</span>
      <div className={`flex min-h-[560px] flex-col gap-8 pt-28 pb-10 lg:min-h-[640px] lg:flex-row lg:items-end lg:justify-between ${GUTTER}`}>
        <div className="flex max-w-2xl flex-1 flex-col justify-end lg:self-stretch">
          <Skeleton className="mb-5 h-4 w-24" />
          <Skeleton className="h-16 w-4/5 sm:h-20" />
          <Skeleton className="mt-3 h-16 w-1/2 sm:h-20" />
          <Skeleton className="mt-5 h-4 w-72 max-w-full" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-11/12" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-28" />
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="size-12 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-44 w-full rounded-panel lg:w-[23rem]" />
      </div>
      <div className={`mt-4 ${GUTTER}`}>
        <div className="mb-5 flex items-center justify-between">
          <Skeleton className="h-7 w-36" />
          {variant === "show" && <Skeleton className="h-11 w-48 rounded-full" />}
        </div>
        {variant === "show" ? (
          <EpisodeRowsSkeleton count={4} />
        ) : (
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex w-28 shrink-0 flex-col items-center">
                <Skeleton className="size-24 rounded-full" />
                <Skeleton className="mt-3 h-3.5 w-20" />
                <Skeleton className="mt-1.5 h-3 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EpisodeRowsSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="border-t border-hairline">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-hairline px-2 py-4 sm:gap-6 sm:px-4 sm:py-5">
          <Skeleton className="hidden h-7 w-8 sm:mx-2 sm:block" />
          <Skeleton className="aspect-video w-36 shrink-0 sm:w-44 lg:w-56" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3.5 w-full max-w-xl" />
            <Skeleton className="mt-2 h-3.5 w-2/3 max-w-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Whole-page states (the only h1 on the page). */
export function DetailNotFound() {
  return (
    <div className={`pt-36 pb-24 ${GUTTER}`}>
      <EmptyState
        as="h1"
        title="This title isn't in your library"
        description="It may have been removed, or the link is wrong."
        action={
          <Link href="/library" className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
            Back to Library
          </Link>
        }
      />
    </div>
  );
}

export function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={`pt-36 pb-24 ${GUTTER}`}>
      <ErrorState
        as="h1"
        title="Couldn't load this title"
        description="Jellyfin didn't respond. Check your connection and try again."
        action={
          <button type="button" onClick={onRetry} className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
            Try again
          </button>
        }
      />
    </div>
  );
}

/** Small inline retry block used inside sections. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ErrorState
      as="h3"
      title={message}
      className="py-10"
      action={
        <button type="button" onClick={onRetry} className={buttonClasses({ variant: "outline", size: "sm" })}>
          Retry
        </button>
      }
    />
  );
}
