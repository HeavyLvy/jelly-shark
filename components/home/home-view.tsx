"use client";

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { EmptyState } from "@/components/ui/states";
import { useLatestVideo, useNextUp, useResumeVideos, type Seed } from "@/lib/queries/home";
import { useNow } from "@/lib/use-now";
import { HomeHero, HomeHeroError, HomeHeroSkeleton, type HeroSlide } from "./home-hero";
import {
  BecauseYouWatchedRow,
  ContinueWatchingRow,
  MusicRow,
  MusicRowSkeleton,
  RecentlyAddedRow,
  RowSkeleton,
  FavoritesRow,
  RecentlyWatchedRow,
  PopularRow,
  PopularRowSkeleton,
} from "./home-rows";
import { useUiPrefs, type HomeRowId } from "@/lib/ui-prefs";

const MAX_SLIDES = 6;
/** Slots per kind before leftovers are filled in order, so no kind crowds out the rest. */
const PER_KIND = 2;
/** How recent counts as "new". */
const NEW_DAYS = 14;

function hasBackdrop(item: BaseItemDto): boolean {
  return (item.BackdropImageTags?.length ?? 0) > 0 || (item.ParentBackdropImageTags?.length ?? 0) > 0;
}

function isRecent(item: BaseItemDto, now: Date): boolean {
  const added = item.DateCreated ? Date.parse(item.DateCreated) : NaN;
  return now.getTime() - added <= NEW_DAYS * 86_400_000;
}

/**
 * The hero mixes what you're in the middle of, new episodes of shows you
 * watch, and new additions to the library. Each kind gets up to PER_KIND
 * slides first (in that order); anything left over fills the remaining
 * slots, ending with older library titles so the hero is never empty.
 */
function buildSlides(resume: BaseItemDto[], nextUp: BaseItemDto[], latest: BaseItemDto[], now: Date): HeroSlide[] {
  const slides: HeroSlide[] = [];
  const seen = new Set<string>();
  const push = (item: BaseItemDto, source: HeroSlide["source"]) => {
    const key = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id ?? "";
    if (!key || seen.has(key) || !hasBackdrop(item) || slides.length >= MAX_SLIDES) return false;
    seen.add(key);
    slides.push({ item, source });
    return true;
  };
  // Next Up is the next unwatched episode of every show you've started, so a recent one is a new episode.
  const newEpisodes = nextUp.filter((e) => e.Type === "Episode" && isRecent(e, now));
  const newReleases = latest.filter((i) => isRecent(i, now));
  const kinds: [BaseItemDto[], HeroSlide["source"]][] = [
    [resume, "resume"],
    [newEpisodes, "newEpisode"],
    [newReleases, "newRelease"],
  ];
  for (const [list, source] of kinds) {
    let taken = 0;
    for (const item of list) if (taken < PER_KIND && push(item, source)) taken++;
  }
  for (const [list, source] of kinds) list.forEach((i) => push(i, source));
  latest.forEach((i) => push(i, "featured"));
  return slides;
}

function seedFrom(slide: HeroSlide | undefined): Seed | null {
  if (!slide) return null;
  const { item } = slide;
  if (item.Type === "Episode" && item.SeriesId) return { id: item.SeriesId, name: item.SeriesName ?? "this show" };
  return item.Id ? { id: item.Id, name: item.Name ?? "this" } : null;
}

export function HomeView() {
  const { hiddenRows } = useUiPrefs();
  const show = (id: HomeRowId) => !hiddenRows.includes(id);
  const resume = useResumeVideos();
  const latest = useLatestVideo();
  const nextUp = useNextUp();
  const now = useNow();

  // Each source can fail on its own; the hero uses what loaded (waiting for all, so slides don't reshuffle after first paint).
  const heroPending = resume.isPending || latest.isPending || nextUp.isPending || now === null;
  const heroFailed = resume.isError && latest.isError;
  const slides = heroPending || heroFailed || now === null ? [] : buildSlides(resume.data ?? [], nextUp.data ?? [], latest.data ?? [], now);
  const featured = slides.find((s) => s.source === "featured" || s.source === "newRelease") ?? slides[0];

  return (
    <>
      <h1 className="sr-only">Home</h1>
      {heroPending ? (
        <HomeHeroSkeleton />
      ) : heroFailed ? (
        <HomeHeroError
          onRetry={() => {
            void resume.refetch();
            void latest.refetch();
          }}
        />
      ) : slides.length > 0 ? (
        <HomeHero slides={slides} />
      ) : (
        <EmptyState
          className="px-4 pt-36 pb-10"
          title="Nothing to feature yet"
          description="Once your Jellyfin libraries have movies or shows with artwork, they'll show up here."
        />
      )}
      {/* Rows can be hidden in Settings → Home. */}
      <div className="relative z-10 flex flex-col gap-10 pb-20 sm:gap-12">
        {show("continue") && <ContinueWatchingRow />}
        {show("popular") && <PopularRow />}
        {show("favorites") && <FavoritesRow />}
        {show("recentlyWatched") && <RecentlyWatchedRow />}
        {show("recentlyAdded") && <RecentlyAddedRow />}
        {/* The "More Like" fallback needs the hero's first title; hold its slot meanwhile. */}
        {show("becauseYouWatched") && (heroPending ? <RowSkeleton shape="poster" /> : <BecauseYouWatchedRow fallback={seedFrom(featured)} />)}
        {show("music") && <MusicRow />}
      </div>
    </>
  );
}

export function HomeSkeleton() {
  return (
    <>
      <HomeHeroSkeleton />
      <div className="flex flex-col gap-10 pb-20 sm:gap-12" aria-hidden="true">
        <SkeletonRows />
      </div>
    </>
  );
}

function SkeletonRows() {
  return (
    <>
      <RowSkeleton shape="landscape" count={5} />
      <PopularRowSkeleton />
      <RowSkeleton shape="poster" />
      <RowSkeleton shape="poster" />
      <MusicRowSkeleton />
    </>
  );
}
