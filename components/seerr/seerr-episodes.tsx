"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArtFallback } from "@/components/media/bits";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectMenu } from "@/components/ui/select-menu";
import { EmptyState } from "@/components/ui/states";
import { EpisodeRowsSkeleton, GUTTER, SectionError } from "@/components/detail/detail-hero";
import { seerrImageSrc, useSeerrEpisodes } from "@/lib/queries/seerr";
import { formatDay, formatMinutes, plural } from "@/lib/seerr/format";
import { isRequestable, type SeerrDetail, type SeerrEpisode } from "@/lib/seerr/types";
import { StatusBadge } from "./seerr-bits";

/** More seasons than this collapse the button row into a dropdown (as on a library show). */
const MAX_SEASON_BUTTONS = 5;
/** On a phone, more seasons than this use the dropdown. */
const MAX_PHONE_BUTTONS = 3;

/**
 * A show's seasons and episodes, laid out like a library show's Episodes
 * section. Each season says where it stands and can be requested from here.
 */
export function SeerrEpisodes({ detail, onRequestSeason, requesting }: { detail: SeerrDetail; onRequestSeason: (season: number) => void; requesting: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seasons = detail.seasons;
  const wanted = Number(searchParams.get("season"));
  const selected = seasons.find((s) => s.number === wanted) ?? seasons[0];
  const options = seasons.map((s) => ({ value: String(s.number), label: s.name }));

  if (seasons.length === 0) return null;

  const select = (value: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("season", value);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  return (
    <section aria-labelledby="episodes-heading" className={GUTTER}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 id="episodes-heading" className="font-display text-2xl font-bold tracking-tight">
          Episodes
        </h2>
        {seasons.length > 1 ? (
          seasons.length > MAX_SEASON_BUTTONS ? (
            <SelectMenu value={String(selected.number)} options={options} onChange={select} label="Season" />
          ) : seasons.length > MAX_PHONE_BUTTONS ? (
            // Four or five buttons run off the edge of a phone: use the dropdown there.
            <>
              <SegmentedControl aria-label="Season" segments={options} value={String(selected.number)} onChange={select} className="max-sm:hidden" />
              <SelectMenu value={String(selected.number)} options={options} onChange={select} label="Season" className="sm:hidden" />
            </>
          ) : (
            <SegmentedControl aria-label="Season" segments={options} value={String(selected.number)} onChange={select} />
          )
        ) : (
          <span className="jelly-flat rounded-full px-4 py-2 text-sm font-semibold text-text-secondary">{selected.name}</span>
        )}
      </div>

      <div className="jelly-flat mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-panel px-4 py-3">
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text">{selected.name}</span>
          {selected.episodeCount > 0 && <> · {plural(selected.episodeCount, "episode")}</>}
        </p>
        {isRequestable(selected.status) ? (
          <Button size="sm" variant="secondary" disabled={requesting} aria-label={`Request ${selected.name}`} onClick={() => onRequestSeason(selected.number)}>
            {selected.status === "partial" ? "Request the rest" : "Request this season"}
          </Button>
        ) : (
          <StatusBadge status={selected.status} className="bg-overlay" />
        )}
      </div>

      <Episodes id={detail.item.id} season={selected.number} />
    </section>
  );
}

function Episodes({ id, season }: { id: number; season: number }) {
  const episodes = useSeerrEpisodes(id, season);
  if (episodes.isPending) return <EpisodeRowsSkeleton count={6} />;
  if (episodes.isError) return <SectionError message="Couldn't load episodes" onRetry={() => void episodes.refetch()} />;
  if (episodes.data.length === 0) {
    return <EmptyState as="h3" title="No episodes listed" description="Seerr doesn't have episode details for this season yet." className="border-t border-hairline py-12" />;
  }
  return (
    <ol className="border-t border-hairline">
      {episodes.data.map((ep) => (
        <EpisodeRow key={ep.number} episode={ep} />
      ))}
    </ol>
  );
}

function EpisodeRow({ episode }: { episode: SeerrEpisode }) {
  const upcoming = !!episode.airDate && episode.airDate > new Date().toISOString().slice(0, 10);
  const runtime = formatMinutes(episode.runtime);
  return (
    <li className="border-b border-hairline">
      <div className="flex items-start gap-3 px-2 py-4 sm:items-center sm:gap-6 sm:px-4 sm:py-5">
        <span aria-hidden="true" className="hidden w-10 shrink-0 text-center font-display text-2xl font-bold whitespace-nowrap text-muted tabular-nums sm:block">
          {episode.number}
        </span>
        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-card bg-surface-raised ring-1 ring-hairline sm:w-44 lg:w-56">
          {episode.stillPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- a still served by our own server
            <img src={seerrImageSrc(episode.stillPath, "w300")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ArtFallback title={`Episode ${episode.number}`} className="p-2 [&>span]:text-sm" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold text-text">
              <span className="text-muted sm:hidden">{episode.number}. </span>
              {episode.name}
            </h3>
            {runtime && <span className="shrink-0 text-xs text-muted">{runtime}</span>}
          </div>
          {episode.overview && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">{episode.overview}</p>}
          {upcoming ? (
            <p className="mt-2 text-[11px] font-bold tracking-wider text-accent uppercase">Airs {formatDay(episode.airDate)}</p>
          ) : (
            episode.airDate && <p className="mt-2 text-xs text-muted">{formatDay(episode.airDate)}</p>
          )}
        </div>
      </div>
    </li>
  );
}
