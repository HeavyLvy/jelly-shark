"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Clock, Pause, Play, X } from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { ArtistLinks, TrackArt } from "@/components/player/track-bits";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { dotJoin, formatClock, formatRuntime, formatYears, ticksToSeconds } from "@/lib/format";
import { pickImage } from "@/lib/jellyfin/images";
import { fetchTracksFor } from "@/lib/queries/music";
import { currentTrack, usePlayer, type PlaySource } from "@/lib/player/store";
import { clearRecentSearches, removeRecentSearch, useRecentSearches, type SearchScope } from "@/lib/recent-searches";
import { detailHref, watchHref } from "@/lib/routes";

/* ---------- type labels / links ---------- */

const TYPE_LABEL: Record<string, string> = {
  Movie: "Movie",
  Series: "Series",
  Episode: "Episode",
  Audio: "Song",
  MusicAlbum: "Album",
  MusicArtist: "Artist",
  Playlist: "Playlist",
};

export function typeBadge(item: BaseItemDto): string {
  return TYPE_LABEL[item.Type ?? ""] ?? item.Type ?? "";
}

/** Detail page for any result (music items route into the music shell). */
export function resultHref(item: BaseItemDto): string {
  if (item.Type === "Audio") return item.AlbumId ? `/music/album/${item.AlbumId}` : "/music";
  return detailHref(item);
}

/* ---------- top result ---------- */

/** "Top result" card (mockup 05): art, big title, type badge, meta, and Play. */
export function TopResultCard({ item, source, className }: { item: BaseItemDto; source: PlaySource; className?: string }) {
  const playItems = usePlayer((s) => s.playItems);
  const isMusic = ["Audio", "MusicAlbum", "MusicArtist", "Playlist"].includes(item.Type ?? "");
  const round = item.Type === "MusicArtist";
  const square = isMusic;
  const meta =
    item.Type === "Movie"
      ? dotJoin(item.ProductionYear, formatRuntime(item.RunTimeTicks), item.Genres?.slice(0, 2).join(", "))
      : item.Type === "Series"
        ? dotJoin(formatYears(item), item.Genres?.slice(0, 2).join(", "))
        : item.Type === "Episode"
          ? dotJoin(item.SeriesName, item.ParentIndexNumber != null && item.IndexNumber != null ? `S${item.ParentIndexNumber}:E${item.IndexNumber}` : null)
          : item.Type === "Audio" || item.Type === "MusicAlbum"
            ? dotJoin(item.AlbumArtist ?? item.Artists?.[0], item.Type === "Audio" ? item.Album : item.ProductionYear)
            : null;

  const playButton = (() => {
    const cls = "inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition hover:brightness-110";
    if (item.Type === "Movie" || item.Type === "Episode")
      return item.Id ? (
        <Link href={watchHref(item.Id)} className={cls}>
          <Play className="size-4 fill-current" aria-hidden="true" /> Play
        </Link>
      ) : null;
    if (item.Type === "Series")
      return (
        <Link href={detailHref(item)} className={cls}>
          <Play className="size-4 fill-current" aria-hidden="true" /> Play
        </Link>
      );
    if (isMusic)
      return (
        <button type="button" className={cls} onClick={() => void fetchTracksFor(item).then((t) => playItems(t, 0, source))}>
          <Play className="size-4 fill-current" aria-hidden="true" /> Play
        </button>
      );
    return null;
  })();

  return (
    <div className={cn("jelly-solid flex min-w-0 items-center gap-4 rounded-panel p-4 sm:gap-6 sm:p-6", className)}>
      <Link href={resultHref(item)} className="shrink-0" aria-label={`Open ${item.Name}`}>
        <JfImage
          image={pickImage(item, square ? "square" : item.Type === "Episode" ? "landscape" : "poster")}
          alt=""
          sizes="160px"
          className={cn(
            "bg-surface-raised shadow-xl shadow-black/40",
            round ? "size-20 rounded-full sm:size-36" : square ? "size-20 rounded-card sm:size-36" : item.Type === "Episode" ? "aspect-video w-28 rounded-card sm:w-48" : "aspect-[2/3] w-20 rounded-card sm:w-32",
          )}
          fallback={<span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-extrabold text-muted">{item.Name?.charAt(0)}</span>}
        />
      </Link>
      <div className="min-w-0">
        <Link href={resultHref(item)} className="block hover:underline">
          <h3 className="line-clamp-2 font-display text-xl leading-tight font-extrabold tracking-display break-words sm:text-4xl">{item.Name}</h3>
        </Link>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span className="rounded-full bg-overlay-strong px-2.5 py-0.5 text-xs font-bold tracking-wide text-text uppercase">{typeBadge(item)}</span>
          {meta && <span className="max-sm:line-clamp-1 max-sm:text-xs">{meta}</span>}
        </p>
        {playButton && <div className="mt-3 sm:mt-4 max-sm:[&>*]:h-9 max-sm:[&>*]:px-4">{playButton}</div>}
      </div>
    </div>
  );
}

export function TopResultSkeleton() {
  return (
    <div className="jelly-solid flex items-center gap-4 rounded-panel p-4 sm:gap-6 sm:p-6" aria-hidden="true">
      <Skeleton tone="raised" className="aspect-[2/3] w-32" />
      <div className="flex-1 space-y-3">
        <Skeleton tone="raised" className="h-9 w-2/3" />
        <Skeleton tone="raised" className="h-4 w-1/3" />
        <Skeleton tone="raised" className="h-11 w-24 rounded-full" />
      </div>
    </div>
  );
}

/* ---------- compact songs list ---------- */

/** Mockup 05 "Songs": art · title · artist · album · duration; click plays (from that song). */
export function SongList({ songs, source }: { songs: BaseItemDto[]; source: PlaySource }) {
  const current = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const { playItems, togglePlay } = usePlayer.getState();
  return (
    <ul>
      {songs.map((s, i) => {
        const isCurrent = current?.Id === s.Id;
        return (
          <li key={s.Id}>
            <div
              className={cn("group flex cursor-pointer items-center gap-3 rounded-card p-2 transition hover:bg-overlay", isCurrent && "bg-overlay-strong")}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) return;
                if (isCurrent) togglePlay();
                else playItems(songs, i, source);
              }}
            >
              <span className="relative shrink-0">
                <TrackArt item={s} size={48} className="size-12" />
                <button
                  type="button"
                  aria-label={isCurrent && playing ? `Pause ${s.Name}` : `Play ${s.Name}`}
                  onClick={() => (isCurrent ? togglePlay() : playItems(songs, i, source))}
                  className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-bg/60 text-text opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {isCurrent && playing ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-4 fill-current" aria-hidden="true" />}
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", isCurrent ? "text-accent" : "text-text")}>{s.Name}</span>
                <span className="block truncate text-xs text-muted">
                  <ArtistLinks item={s} />
                  {s.Album && (
                    <>
                      {" · "}
                      {s.AlbumId ? (
                        <Link href={`/music/album/${s.AlbumId}`} className="hover:text-text hover:underline">
                          {s.Album}
                        </Link>
                      ) : (
                        s.Album
                      )}
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{formatClock(ticksToSeconds(s.RunTimeTicks))}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SongListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton tone="raised" className="size-12" />
          <div className="flex-1 space-y-1.5">
            <Skeleton tone="raised" className="h-3.5 w-1/2" />
            <Skeleton tone="raised" className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- genre tiles ---------- */

const TILE_CLASSES = ["bg-tile-1", "bg-tile-2", "bg-tile-3", "bg-tile-4", "bg-tile-5", "bg-tile-6", "bg-tile-7", "bg-tile-8"];

function tileClass(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_CLASSES[h % TILE_CLASSES.length];
}

/** "Browse all" grid of coloured genre tiles (link or action). */
export function GenreTiles({
  genres,
  hrefFor,
  onPick,
  loading,
}: {
  genres: BaseItemDto[];
  hrefFor?: (genre: BaseItemDto) => string;
  onPick?: (genre: BaseItemDto) => void;
  loading?: boolean;
}) {
  const tileCls = "relative flex aspect-[16/9] items-start overflow-hidden rounded-panel p-4 text-left font-display text-lg font-bold tracking-tight text-text transition hover:brightness-110 sm:text-xl";
  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(11rem,calc(50%-0.5rem)),1fr))] gap-4" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} tone="raised" className="aspect-[16/9] rounded-panel" />
        ))}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(11rem,calc(50%-0.5rem)),1fr))] gap-4">
      {genres.map((g) => {
        const name = g.Name ?? "Genre";
        const body: ReactNode = (
          <>
            <span className="relative z-10 drop-shadow">{name}</span>
            <span aria-hidden="true" className="absolute -right-4 -bottom-6 size-24 rotate-[20deg] rounded-card bg-overlay-strong" />
          </>
        );
        return (
          <li key={g.Id ?? name}>
            {hrefFor ? (
              <Link href={hrefFor(g)} className={cn(tileCls, tileClass(name))}>
                {body}
              </Link>
            ) : (
              <button type="button" onClick={() => onPick?.(g)} className={cn(tileCls, "w-full", tileClass(name))}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- recent searches ---------- */

export function RecentSearches({ scope, onPick }: { scope: SearchScope; onPick: (term: string) => void }) {
  const recent = useRecentSearches(scope);
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby={`recent-${scope}`} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id={`recent-${scope}`} className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
          Recent searches
        </h2>
        <button type="button" onClick={() => clearRecentSearches(scope)} className="text-xs font-semibold text-muted hover:text-text">
          Clear all
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {recent.map((t) => (
          <li key={t} className="jelly-control flex h-9 items-center rounded-full pr-1 pl-4 text-sm text-text-secondary">
            <button type="button" onClick={() => onPick(t)} className="flex items-center gap-2 hover:text-text">
              <Clock className="size-3.5" aria-hidden="true" />
              {t}
            </button>
            <button type="button" aria-label={`Remove ${t} from recent searches`} onClick={() => removeRecentSearch(scope, t)} className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
