"use client";

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { EmptyState } from "@/components/ui/states";
import { useLatestVideo, useResumeVideos, type Seed } from "@/lib/queries/home";
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

const MAX_SLIDES = 5;

function hasBackdrop(item: BaseItemDto): boolean {
  return (item.BackdropImageTags?.length ?? 0) > 0 || (item.ParentBackdropImageTags?.length ?? 0) > 0;
}

/** Resume items first, topped up with the newest movies/series that have backdrop art. */
function buildSlides(resume: BaseItemDto[], latest: BaseItemDto[]): HeroSlide[] {
  const slides: HeroSlide[] = [];
  const seen = new Set<string>();
  const push = (item: BaseItemDto, source: HeroSlide["source"]) => {
    const key = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id ?? "";
    if (!key || seen.has(key) || !hasBackdrop(item) || slides.length >= MAX_SLIDES) return;
    seen.add(key);
    slides.push({ item, source });
  };
  resume.forEach((i) => push(i, "resume"));
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

  // Resume can fail on its own; the hero still works from Latest.
  const heroPending = resume.isPending || latest.isPending;
  const heroFailed = resume.isError && latest.isError;
  const slides = heroPending || heroFailed ? [] : buildSlides(resume.data ?? [], latest.data ?? []);
  const featured = slides.find((s) => s.source === "featured") ?? slides[0];

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
