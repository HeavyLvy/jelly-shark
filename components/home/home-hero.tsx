"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore, type FocusEvent } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Pause, Play } from "lucide-react";
import { CommunityRating, RatingBadge } from "@/components/media/bits";
import { AddToListButton, FavoriteButton, HeroBackdrop, MoreInfoButton, PlayButton, TitleTreatment } from "@/components/media/hero";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { SharkGlyph } from "@/components/ui/logo";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { dotJoin, episodeCode, formatEndsAt, formatRating, formatRuntime, formatYears, playedPercent, remainingTicks } from "@/lib/format";
import { useSeriesPlayTarget } from "@/lib/queries/home";
import { detailHref, watchHref } from "@/lib/routes";
import { useNow } from "@/lib/use-now";

export interface HeroSlide {
  item: BaseItemDto;
  source: "resume" | "featured";
}

const AUTO_ADVANCE_MS = 8000;

/** Shared hero box: the pill nav floats over the top of it. */
const heroBox = "relative isolate flex min-h-[540px] flex-col justify-end overflow-hidden sm:min-h-[580px] lg:min-h-[620px]";
const heroContent = "relative z-10 w-full px-4 pt-28 pb-16 sm:px-8 sm:pb-20 lg:px-11";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // Assume reduced motion on the server so nothing auto-advances before hydration decides.
    () => true,
  );
}

/**
 * Netflix-style featured carousel. Auto-advances every 8s, pausing while
 * hovered or focused, never under prefers-reduced-motion, and has an explicit
 * pause/play control (WCAG 2.2.2).
 */
export function HomeHero({ slides }: { slides: HeroSlide[] }) {
  // `prev` keeps the outgoing backdrop mounted for the cross-fade.
  const [{ index, prev }, setPos] = useState<{ index: number; prev: number | null }>({ index: 0, prev: null });
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const count = slides.length;
  const active = Math.min(index, Math.max(0, count - 1));
  const autoplay = count > 1 && !reduced && !userPaused;
  const running = autoplay && !hovered && !focused;
  const regionId = useId();

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setPos((p) => ({ index: (p.index + 1) % count, prev: p.index })), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [running, active, count]);

  const onBlur = useCallback((e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  }, []);

  const slide = slides[active];
  if (!slide) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className={heroBox}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      {/* Backdrops cross-fade. Only the active, outgoing and next slides are
          mounted, so the first paint doesn't download every full-width image. */}
      {slides.map((s, i) =>
        i === active || i === prev || i === (active + 1) % count ? (
          <HeroBackdrop
            key={s.item.Id ?? i}
            item={s.item}
            preload={i === 0}
            className={cn("-z-10 transition-opacity duration-700", i === active ? "opacity-100" : "opacity-0")}
          />
        ) : null,
      )}

      <div
        id={regionId}
        className={heroContent}
        aria-live={running ? "off" : "polite"}
      >
        <div
          key={slide.item.Id ?? active}
          role="group"
          aria-roledescription="slide"
          aria-label={`${active + 1} of ${count}`}
          className="max-w-xl transition-[opacity,translate] duration-500 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
        >
          <SlideContent slide={slide} />
        </div>
      </div>

      {count > 1 && (
        <div className="jelly-flat absolute right-4 bottom-5 z-10 flex items-center gap-1 rounded-full px-1.5 sm:right-8 sm:bottom-[76px] lg:right-11">
          {!reduced && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Resume slideshow" : "Pause slideshow"}
              aria-controls={regionId}
              className="mr-1 flex size-8 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text"
            >
              {userPaused ? <Play className="size-3.5 fill-current" aria-hidden="true" /> : <Pause className="size-3.5 fill-current" aria-hidden="true" />}
            </button>
          )}
          <div role="group" aria-label="Choose a featured title" className="flex items-center">
            {slides.map((s, i) => {
              const current = i === active;
              const name = s.item.Type === "Episode" ? s.item.SeriesName ?? s.item.Name : s.item.Name;
              return (
                <button
                  key={s.item.Id ?? i}
                  type="button"
                  aria-label={`Show ${name ?? `slide ${i + 1}`} (${i + 1} of ${count})`}
                  aria-current={current ? "true" : undefined}
                  aria-controls={regionId}
                  onClick={() => setPos({ index: i, prev: i === active ? prev : active })}
                  className="group flex h-8 min-w-6 items-center justify-center px-2"
                >
                  <span
                    className={cn(
                      "block h-2 rounded-full transition-all duration-300",
                      current ? "w-7 bg-text" : "w-2 bg-text/40 group-hover:bg-text/70",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

    </section>
  );
}

function SlideContent({ slide }: { slide: HeroSlide }) {
  const { item, source } = slide;
  const now = useNow();
  const isSeries = item.Type === "Series";
  const isEpisode = item.Type === "Episode";
  const inProgress = playedPercent(item) !== null;
  const rating = formatRating(item.CommunityRating);
  const runtime = isSeries ? null : formatRuntime(item.RunTimeTicks);
  const endsAt = !isSeries && now ? formatEndsAt(remainingTicks(item), now) : null;
  const genres = (item.Genres ?? []).slice(0, 3);
  const year = isSeries ? formatYears(item) : item.ProductionYear;

  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-accent uppercase sm:text-xs">
        <SharkGlyph className="size-4" />
        {source === "resume" ? "Continue watching" : "Featured in your library"}
      </p>
      <TitleTreatment item={item} as="h2" />
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
        {item.OfficialRating && <RatingBadge rating={item.OfficialRating} />}
        {isEpisode && <span className="font-medium text-text">{dotJoin(episodeCode(item), item.Name)}</span>}
        {year && <span>{year}</span>}
        {runtime && <span>{runtime}</span>}
        {endsAt && <span>{endsAt}</span>}
        {rating && <CommunityRating value={rating} />}
      </div>
      {item.Overview && <p className="mt-4 line-clamp-3 max-w-lg text-[15px] leading-relaxed text-text-secondary">{item.Overview}</p>}
      {/* On phones the buttons drop to md so Play, More info, + and ♥ share one line. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 max-sm:gap-2.5 max-sm:[&>a]:h-10 max-sm:[&>a]:min-w-0 max-sm:[&>a]:px-4 max-sm:[&>a]:text-sm max-sm:[&>div]:gap-2.5 max-sm:[&>div>div>button]:size-10 max-sm:[&>div>button]:size-10">
        {isSeries ? <SeriesPlay item={item} /> : item.Id && <PlayButton href={watchHref(item.Id)} label={inProgress ? "Resume" : "Play"} />}
        <MoreInfoButton href={detailHref(item)} />
        {/* Icon pair wraps as a unit on narrow screens. */}
        <div className="flex items-center gap-3">
          <AddToListButton item={item} />
          <FavoriteButton item={item} />
        </div>
      </div>
      {genres.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Genres">
          {genres.map((g) => (
            <li key={g}>
              <TagChip>{g}</TagChip>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Series: play the next-up (or first) episode; the detail page until that's known. */
function SeriesPlay({ item }: { item: BaseItemDto }) {
  const target = useSeriesPlayTarget(item.Id ?? null);
  const ep = target.data;
  if (!ep?.Id) return <PlayButton href={detailHref(item)} label="Play" />;
  const code = episodeCode(ep);
  const resume = playedPercent(ep) !== null;
  const verb = resume ? "Resume" : "Play";
  return <PlayButton href={watchHref(ep.Id)} label={code ? `${verb} ${code}` : verb} />;
}

export function HomeHeroSkeleton() {
  return (
    <div className={heroBox} aria-hidden="true">
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-surface/60 to-bg" />
      <div className={heroContent}>
        <div className="max-w-xl">
          <Skeleton className="mb-4 h-3.5 w-48" />
          <Skeleton className="h-16 w-4/5 sm:h-20" />
          <Skeleton className="mt-5 h-4 w-72 max-w-full" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-11/12" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-6 flex gap-3">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-12 w-32" />
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="size-12 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeHeroError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={cn(heroBox, "min-h-[420px] sm:min-h-[460px] lg:min-h-[460px]")}>
      <ErrorState
        className={heroContent}
        title="Couldn't load featured titles"
        description="Jellyfin didn't answer. Check that the server is reachable and try again."
        action={<Button onClick={onRetry}>Retry</Button>}
      />
    </div>
  );
}

