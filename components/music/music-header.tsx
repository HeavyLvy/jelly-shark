"use client";

import type { ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Shuffle } from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { TICKS_PER_SECOND } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { BigPlayButton } from "./music-cards";
import { useScrolledPast } from "./use-scrolled-past";

/** Total runtime of a track list, e.g. "47 min" / "1 hr 12 min". */
export function totalDuration(tracks: BaseItemDto[]): string | null {
  const minutes = Math.round(tracks.reduce((n, x) => n + (x.RunTimeTicks ?? 0), 0) / TICKS_PER_SECOND / 60);
  if (minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} hr ${minutes % 60} min` : `${minutes} min`;
}

/** Album / artist / playlist header: art, eyebrow, big title, meta, and actions. */
export function MusicHeader({
  item,
  eyebrow,
  title,
  meta,
  round,
  art,
  onPlay,
  onShuffle,
  actions,
  playDisabled,
}: {
  item?: BaseItemDto;
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode;
  round?: boolean;
  art?: ReactNode;
  onPlay: () => void;
  onShuffle: () => void;
  actions?: ReactNode;
  playDisabled?: boolean;
}) {
  const [sentinel, pastHeader] = useScrolledPast<HTMLDivElement>(64);
  const compactTitle = typeof title === "string" ? title : eyebrow;
  return (
    <>
    {/* Spotify-style compact bar: appears (jelly glass) once the big header scrolls away. */}
    <div
      aria-hidden={!pastHeader}
      className={cn(
        "sticky top-0 z-20 -mb-16 flex h-16 items-center gap-3 rounded-t-panel px-5 transition-opacity duration-200 sm:px-7",
        pastHeader ? "jelly border-x-0 border-t-0 opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <BigPlayButton size="md" onClick={onPlay} label={`Play ${compactTitle}`} className={cn(playDisabled && "pointer-events-none opacity-50")} />
      <span className="truncate font-display text-xl font-bold tracking-tight">{compactTitle}</span>
    </div>
    <header className="rounded-t-panel bg-linear-to-b from-accent/15 to-accent/0 px-5 pt-6 pb-5 sm:px-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
        {art ?? (
          <JfImage
            image={item ? pickImage(item, "square") : null}
            alt=""
            sizes="224px"
            preload
            className={cn("size-44 shrink-0 bg-surface-raised shadow-2xl shadow-black/50 sm:size-56", round ? "rounded-full" : "rounded-panel")}
            fallback={<span className="absolute inset-0 flex items-center justify-center font-display text-6xl font-extrabold text-muted">{String(item?.Name ?? "?").charAt(0)}</span>}
          />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-text-secondary uppercase">{eyebrow}</p>
          <h1 className="mt-1 font-display text-4xl leading-[1.02] font-extrabold tracking-display text-balance break-words sm:text-5xl lg:text-6xl">{title}</h1>
          {meta && <p className="mt-3 text-sm text-text-secondary">{meta}</p>}
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <BigPlayButton onClick={onPlay} label={`Play ${typeof title === "string" ? title : eyebrow}`} className={cn(playDisabled && "pointer-events-none opacity-50")} />
        <IconButton aria-label="Shuffle play" variant="ghost" size="lg" onClick={onShuffle} disabled={playDisabled}>
          <Shuffle className="size-5" aria-hidden="true" />
        </IconButton>
        {actions}
      </div>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </header>
    </>
  );
}

export function MusicHeaderSkeleton({ round }: { round?: boolean }) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-5 sm:flex-row sm:items-end sm:px-7" aria-hidden="true">
      <Skeleton tone="raised" className={cn("size-44 sm:size-56", round ? "rounded-full" : "rounded-panel")} />
      <div className="flex-1 space-y-3">
        <Skeleton tone="raised" className="h-3 w-16" />
        <Skeleton tone="raised" className="h-12 w-2/3" />
        <Skeleton tone="raised" className="h-3.5 w-1/3" />
      </div>
    </div>
  );
}
