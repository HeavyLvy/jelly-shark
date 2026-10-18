"use client";

import Link from "next/link";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Play, RotateCcw, Tv } from "lucide-react";
import { ArtFallback, ProgressBar } from "@/components/media/bits";
import { JfImage } from "@/components/media/jf-image";
import { useMediaMenu } from "@/components/media/media-menu";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { dotJoin, episodeCode, formatTimeLeft, playedPercent, typeLabel } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { useWatchHistory } from "@/lib/queries/history";
import { detailHref, watchHref } from "@/lib/routes";
import { useIsClient } from "@/lib/use-is-client";
import { useNow } from "@/lib/use-now";

const GUTTER = "px-4 sm:px-8 lg:px-11";

/** "Today" / "Yesterday" / "Monday" (this week) / "Oct 3" / "Oct 3, 2025". */
function dayLabel(d: Date, now: Date): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Watch history: everything you've played, newest first, grouped by day. */
export function HistoryView() {
  const isClient = useIsClient();
  const history = useWatchHistory();
  const now = useNow();
  if (!isClient || history.isPending || !now) return <HistorySkeleton />;
  if (history.isError) {
    return (
      <div className={`pt-28 ${GUTTER}`}>
        <ErrorState title="Couldn't load your history" action={<Button onClick={() => void history.refetch()}>Try again</Button>} />
      </div>
    );
  }
  const groups: { label: string; items: BaseItemDto[] }[] = [];
  for (const item of history.data) {
    const label = dayLabel(new Date(item.UserData?.LastPlayedDate ?? 0), now);
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return (
    <div className={`mx-auto max-w-4xl pt-28 pb-20 ${GUTTER}`}>
      <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">Watch history</h1>
      <p className="mt-2 text-sm text-text-secondary">Everything you&apos;ve watched, newest first.</p>
      {groups.length === 0 ? (
        <EmptyState className="mt-12" title="Nothing watched yet" description="Movies and episodes you play show up here." />
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="mt-10">
            <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted uppercase">{g.label}</h2>
            <ul className="divide-y divide-hairline">
              {g.items.map((item) => (
                <HistoryRow key={item.Id} item={item} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: BaseItemDto }) {
  const { onContextMenu, menu } = useMediaMenu(item);
  const isEpisode = item.Type === "Episode";
  const pct = playedPercent(item);
  const left = formatTimeLeft(item);
  const title = (isEpisode ? item.SeriesName : item.Name) ?? "Untitled";
  const sub = isEpisode ? dotJoin(episodeCode(item), item.Name) : dotJoin(typeLabel(item), item.ProductionYear);
  const when = new Date(item.UserData?.LastPlayedDate ?? 0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const status = pct !== null ? (left ? `${left}` : "In progress") : item.UserData?.Played ? "Watched" : null;
  return (
    <li onContextMenu={onContextMenu} className="flex items-center gap-4 py-3">
      <Link href={detailHref(item)} className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-card bg-surface ring-1 ring-hairline sm:w-40">
        <JfImage image={pickImage(item, "landscape")} alt="" sizes="160px" className="absolute inset-0" fallback={<ArtFallback title={title} className="p-2 [&>span]:text-sm" />} />
        {pct !== null && <ProgressBar percent={pct} className="absolute inset-x-0 bottom-0" />}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={detailHref(item)} className="block truncate font-medium text-text hover:underline">
          {title}
        </Link>
        <p className="truncate text-sm text-text-secondary">{sub}</p>
        <p className="mt-0.5 text-xs text-muted">{dotJoin(when, status)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isEpisode && item.SeriesId && (
          <Link href={`/show/${item.SeriesId}`} aria-label={`Go to ${title}`} className="hidden size-10 items-center justify-center rounded-full text-text-secondary hover:bg-overlay hover:text-text sm:inline-flex">
            <Tv className="size-4" aria-hidden="true" />
          </Link>
        )}
        {item.Id && (
          <Link
            href={pct !== null ? watchHref(item.Id) : `${watchHref(item.Id)}?t=0`}
            className="jelly-control inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-text max-sm:size-10 max-sm:justify-center max-sm:px-0"
            aria-label={pct !== null ? `Resume ${title}` : `Watch ${title} again`}
          >
            {pct !== null ? <Play className="size-4 fill-current" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
            <span className="max-sm:sr-only">{pct !== null ? "Resume" : "Watch again"}</span>
          </Link>
        )}
      </div>
      {menu}
    </li>
  );
}

export function HistorySkeleton() {
  return (
    <div className={`mx-auto max-w-4xl pt-28 ${GUTTER}`} aria-hidden="true">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="mt-3 h-4 w-56" />
      <div className="mt-10 space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="aspect-video w-32 sm:w-40" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
