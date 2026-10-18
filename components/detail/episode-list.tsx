"use client";

import Link from "next/link";
import { useMediaMenu } from "@/components/media/media-menu";
import { useEffect, useRef } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Play } from "lucide-react";
import { ArtFallback, ProgressBar } from "@/components/media/bits";
import { JfImage } from "@/components/media/jf-image";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/states";
import { episodeCode, formatRuntime, formatTimeLeft, playedPercent } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { useEpisodes } from "@/lib/queries/detail";
import { watchHref } from "@/lib/routes";
import { EpisodeRowsSkeleton, SectionError } from "./detail-hero";

/** Episode rows for one season; scrolls to #episode-<id> once loaded. */
export function EpisodeList({ seriesId, seasonId }: { seriesId: string; seasonId: string | null }) {
  const episodes = useEpisodes(seriesId, seasonId);
  const scrolledFor = useRef<string | null>(null);
  const data = episodes.data;

  useEffect(() => {
    if (!data?.length) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#episode-") || scrolledFor.current === hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    scrolledFor.current = hash;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [data]);

  if (!seasonId || episodes.isPending) return <EpisodeRowsSkeleton count={6} />;
  if (episodes.isError) return <SectionError message="Couldn't load episodes" onRetry={() => void episodes.refetch()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        as="h3"
        title="No episodes in this season"
        description="Jellyfin hasn't found any episode files for it yet."
        className="border-t border-hairline py-12"
      />
    );
  }
  // One column width for the whole list so thumbnails line up.
  const wide = data.some((ep) => ep.IndexNumberEnd != null && ep.IndexNumberEnd !== ep.IndexNumber);
  return (
    <ol className="border-t border-hairline">
      {data.map((ep, i) => (
        <EpisodeRow key={ep.Id} episode={ep} fallbackIndex={i + 1} wideIndex={wide} />
      ))}
    </ol>
  );
}

function EpisodeRow({ episode, fallbackIndex, wideIndex }: { episode: BaseItemDto; fallbackIndex: number; wideIndex: boolean }) {
  const id = episode.Id ?? "";
  const index = episode.IndexNumber ?? fallbackIndex;
  // Multi-part files (e.g. SpongeBob's "1–3") carry IndexNumberEnd.
  const end = episode.IndexNumberEnd;
  const isRange = end != null && end !== episode.IndexNumber && episode.IndexNumber != null;
  const label = isRange ? `${index}–${end}` : String(index);
  const name = episode.Name ?? `Episode ${label}`;
  const baseCode = episodeCode(episode);
  const code = baseCode && isRange ? `${baseCode}–E${end}` : baseCode;
  const pct = playedPercent(episode);
  const inProgress = pct !== null;
  const left = formatTimeLeft(episode);
  const watched = !inProgress && !!episode.UserData?.Played;
  const runtime = formatRuntime(episode.RunTimeTicks);
  const status = inProgress ? (left ? `Resume · ${left}` : "Resume") : watched ? "Watched" : null;
  const { onContextMenu, menu } = useMediaMenu(episode);

  return (
    <li
      id={`episode-${id}`}
      onContextMenu={onContextMenu}
      className={cn(
        "scroll-mt-28 border-b border-hairline",
        inProgress && "my-2 rounded-panel border-transparent bg-surface first:mt-0",
      )}
    >
      <div className="flex items-start gap-3 px-2 py-4 sm:items-center sm:gap-6 sm:px-4 sm:py-5">
        <span
          aria-hidden="true"
          className={cn(
            "hidden shrink-0 text-center font-display font-bold whitespace-nowrap text-muted tabular-nums sm:block",
            wideIndex ? "w-16" : "w-10",
            isRange ? "text-xl" : "text-2xl",
          )}
        >
          {label}
        </span>
        <Link
          href={watchHref(id)}
          aria-label={`Play ${code ?? `Episode ${label}`} ${name}`}
          className="group relative block aspect-video w-36 shrink-0 overflow-hidden rounded-card bg-surface-raised ring-1 ring-hairline outline-offset-2 sm:w-44 lg:w-56"
        >
          <JfImage
            image={pickImage(episode, "landscape")}
            alt=""
            sizes="(min-width: 1024px) 224px, 176px"
            className="absolute inset-0"
            imgClassName="transition duration-300 group-hover:scale-[1.04]"
            fallback={<ArtFallback title={`Episode ${label}`} className="p-2 [&>span]:text-sm" />}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-9 items-center justify-center jelly-control rounded-full text-text transition group-hover:bg-accent group-hover:text-on-accent group-hover:ring-accent">
              <Play className="size-3.5 translate-x-px fill-current" aria-hidden="true" />
            </span>
          </span>
          {pct !== null && <ProgressBar percent={pct} className="absolute inset-x-0 bottom-0" />}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 text-[15px] leading-snug font-semibold text-text">
              <span className="text-muted sm:hidden">{label}. </span>
              {name}
            </h3>
            {runtime && <span className="shrink-0 text-xs text-muted">{runtime}</span>}
          </div>
          {episode.Overview && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">{episode.Overview}</p>
          )}
          {status && <p className="mt-2 text-[11px] font-bold tracking-wider text-accent uppercase">{status}</p>}
        </div>
      </div>
      {menu}
    </li>
  );
}
