"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Shuffle } from "lucide-react";
import { AddToListButton, FavoriteButton, PlayButton } from "@/components/media/hero";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton, Spinner } from "@/components/ui/states";
import { episodeCode, playedPercent } from "@/lib/format";
import { fetchRandomEpisode, isNotFoundError, useFirstEpisode, useNextUp, useSeasons } from "@/lib/queries/detail";
import { useItem } from "@/lib/queries/items";
import { detailHref, watchHref } from "@/lib/routes";
import { DetailError, DetailHero, DetailNotFound, DetailSkeleton, GUTTER, SectionError } from "./detail-hero";
import { EpisodeList } from "./episode-list";
import { InfoPanel, peopleRows, streamRows, streamsOf } from "./info-panel";
import { CastRow, MoreLikeThis } from "./rows";
import { ExtrasRow, TrailerButton } from "./extras";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** /show/[id] — series hero, season switcher, episode list, similar shows. */
export function ShowDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useItem(id);
  const item = query.data;
  // A non-series id (movie, episode, season…) belongs on its own route.
  const forward = item && item.Type !== "Series" ? detailHref(item) : null;

  useEffect(() => {
    if (forward && forward !== `/show/${id}`) router.replace(forward);
  }, [forward, id, router]);

  if (query.isError) {
    return isNotFoundError(query.error) ? <DetailNotFound /> : <DetailError onRetry={() => void query.refetch()} />;
  }
  if (!item || forward) return <DetailSkeleton variant="show" />;
  return (
    <div>
      <title>{`${item.Name ?? "Show"} · Jelly Shark`}</title>
      <SeriesDetail series={item} />
    </div>
  );
}

function SeriesDetail({ series }: { series: BaseItemDto }) {
  const seriesId = series.Id ?? "";
  const seasons = useSeasons(seriesId);
  const nextUp = useNextUp(seriesId);
  const first = useFirstEpisode(seriesId);

  const seasonCount = seasons.data?.filter((s) => (s.IndexNumber ?? 0) >= 1).length || seasons.data?.length || series.ChildCount || 0;
  const episodeCount = series.RecursiveItemCount ?? 0;
  const rows = [...peopleRows(series), ...streamRows(streamsOf(first.data))];

  return (
    <div className="pb-20">
      <DetailHero
        item={series}
        meta={[seasonCount ? plural(seasonCount, "Season") : null, episodeCount ? plural(episodeCount, "Episode") : null]}
        actions={
          <>
            <SeriesPlayButton nextUp={nextUp.data} first={first.data} pending={nextUp.isPending || (!nextUp.data && first.isPending)} />
            <TrailerButton item={series} />
            <ShuffleButton seriesId={seriesId} />
            <AddToListButton item={series} />
            <FavoriteButton item={series} />
          </>
        }
        panel={<InfoPanel rows={rows} pendingRows={first.isPending ? 2 : 0} />}
      />
      <div className="mt-4 flex flex-col gap-14">
        <EpisodesSection seriesId={seriesId} seasons={seasons} nextUp={nextUp} />
        <ExtrasRow item={series} />
        <CastRow people={series.People ?? []} />
        <MoreLikeThis itemId={seriesId} />
      </div>
    </div>
  );
}

function SeriesPlayButton({ nextUp, first, pending }: { nextUp: BaseItemDto | null | undefined; first: BaseItemDto | null | undefined; pending: boolean }) {
  const target = nextUp ?? first;
  if (!target?.Id) {
    if (pending) return <Skeleton className="h-12 w-40" />;
    return null;
  }
  const code = episodeCode(target);
  const verb = playedPercent(target) !== null ? "Resume" : "Play";
  return <PlayButton href={watchHref(target.Id)} label={code ? `${verb} ${code}` : verb} />;
}

function ShuffleButton({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const shuffle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ep = await fetchRandomEpisode(seriesId);
      if (ep?.Id) {
        router.push(watchHref(ep.Id));
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        shape="card"
        onClick={() => void shuffle()}
        disabled={busy}
        aria-describedby={failed ? "shuffle-error" : undefined}
        icon={busy ? <Spinner className="size-4" label="Picking an episode" /> : <Shuffle className="size-4" aria-hidden="true" />}
        className="max-sm:px-4"
      >
        <span className="sr-only sm:not-sr-only">Shuffle</span>
      </Button>
      {failed && (
        <p id="shuffle-error" role="alert" className="basis-full text-xs text-danger">
          Couldn&apos;t pick a random episode. Try again.
        </p>
      )}
    </>
  );
}

function EpisodesSection({
  seriesId,
  seasons,
  nextUp,
}: {
  seriesId: string;
  seasons: ReturnType<typeof useSeasons>;
  nextUp: ReturnType<typeof useNextUp>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("season");
  const list = seasons.data ?? [];

  // ?season= wins; else the next-up episode's season; else the first regular season.
  const fromParam = param ? list.find((s) => s.Id === param) : undefined;
  const nextUpSettled = !nextUp.isPending;
  const fromNextUp = nextUp.data?.SeasonId ? list.find((s) => s.Id === nextUp.data?.SeasonId) : undefined;
  const firstRegular = list.find((s) => (s.IndexNumber ?? 0) >= 1) ?? list[0];
  const selected = fromParam ?? (nextUpSettled ? fromNextUp ?? firstRegular : undefined);
  const selectedId = selected?.Id ?? null;

  const select = (seasonId: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("season", seasonId);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  return (
    <section aria-labelledby="episodes-heading" className={GUTTER}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 id="episodes-heading" className="font-display text-2xl font-bold tracking-tight">
          Episodes
        </h2>
        {seasons.isPending || (list.length > 1 && !selectedId) ? (
          <Skeleton className="h-11 w-48 rounded-full" />
        ) : list.length > 1 && selectedId ? (
          <SegmentedControl
            aria-label="Season"
            segments={list.map((s) => ({ value: s.Id ?? "", label: s.Name ?? `Season ${s.IndexNumber ?? ""}` }))}
            value={selectedId}
            onChange={select}
          />
        ) : list.length === 1 ? (
          <span className="jelly-flat rounded-full px-4 py-2 text-sm font-semibold text-text-secondary">
            {list[0].Name ?? "Season 1"}
          </span>
        ) : null}
      </div>
      {seasons.isError ? (
        <SectionError message="Couldn't load seasons" onRetry={() => void seasons.refetch()} />
      ) : !seasons.isPending && list.length === 0 ? (
        <EpisodeListEmpty />
      ) : (
        <EpisodeList seriesId={seriesId} seasonId={selectedId} />
      )}
    </section>
  );
}

function EpisodeListEmpty() {
  return (
    <p className="border-t border-hairline py-12 text-center text-sm text-muted">This show doesn&apos;t have any seasons in your library yet.</p>
  );
}
