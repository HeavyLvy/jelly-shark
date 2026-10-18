"use client";

import Link from "next/link";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Clock3, GripVertical, Pause, Play } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { formatClock, ticksToSeconds } from "@/lib/format";
import { currentTrack, usePlayer, type PlaySource } from "@/lib/player/store";
import { ArtistLinks, LikeButton, TrackArt } from "@/components/player/track-bits";
import { useEffect, useRef, useState } from "react";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { FloatingMenu, type MenuAnchor } from "@/components/ui/floating-menu";
import { TrackMenu, TrackMenuBody } from "./track-menu";

/** Animated equalizer glyph for the playing row. */
export function EqualizerIcon({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-3.5 items-end gap-[2px]", className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-sm bg-accent", playing ? "animate-[eq_0.9s_ease-in-out_infinite]" : "h-1.5")}
          style={playing ? { animationDelay: `${i * 0.18}s`, height: "100%" } : undefined}
        />
      ))}
    </span>
  );
}

interface TrackTableProps {
  tracks: BaseItemDto[];
  source: PlaySource;
  /** Show album column (search/most played) vs album page (track numbers). */
  showAlbum?: boolean;
  showArt?: boolean;
  showPlays?: boolean;
  /** "track" = album track numbers; "index" = 1..n. */
  numbering?: "track" | "index";
  /** Playlist editing (remove / reorder by PlaylistItemId). */
  onRemove?: (track: BaseItemDto) => void;
  onMove?: (track: BaseItemDto, newIndex: number) => void;
  className?: string;
}

/**
 * Spotify-style track list: # · title/artists · album · plays · ♡ · duration · ⋯.
 * Clicking a row plays the list from that track. The playing row is highlighted.
 */
export function TrackTable({ tracks, source, showAlbum, showArt = true, showPlays, numbering = "index", onRemove, onMove, className }: TrackTableProps) {
  const current = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const { playItems, togglePlay } = usePlayer.getState();
  // One right-click menu for the whole table.
  const [ctx, setCtx] = useState<{ anchor: MenuAnchor; index: number } | null>(null);
  const ctxTrack = ctx ? tracks[ctx.index] : null;
  // Drag-to-reorder (playlists): the page scroller is the music panel (or the document).
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    scrollerRef.current = tableRef.current?.closest<HTMLElement>("[data-scroll-root]") ?? (document.scrollingElement as HTMLElement | null);
  }, []);
  const { drag, onGrab, rowStyle } = useDragReorder(scrollerRef, (from, to) => onMove?.(tracks[from], to));

  // Phones: just art + title/artist + ⋯ (tap the row to play), like Spotify's app.
  const cols = cn(
    "grid items-center gap-3 px-3 max-sm:px-1",
    showAlbum
      ? showPlays
        ? "grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_4.5rem_auto]"
        : "grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
      : showPlays
        ? "grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1fr)_4.5rem_auto]"
        : "grid-cols-[2rem_minmax(0,1fr)_auto]",
    "max-sm:grid-cols-[minmax(0,1fr)_auto]",
  );

  return (
    <div ref={tableRef} role="table" aria-label={`${source.label} tracks`} className={cn(className, drag && "select-none")}>
      <div role="row" className={cn(cols, "h-9 border-b border-hairline text-xs font-semibold tracking-wide text-muted uppercase max-sm:hidden")}>
        <span role="columnheader" className="text-center">#</span>
        <span role="columnheader">Title</span>
        {showAlbum && <span role="columnheader" className="hidden md:block">Album</span>}
        {showPlays && <span role="columnheader" className="hidden text-right md:block">Plays</span>}
        {/* Mirrors the row's right cell (like · time · move · menu) so the clock sits over the times. */}
        <span role="columnheader" className="flex items-center justify-end gap-1">
          <span className="size-8" aria-hidden="true" />
          <span className="flex w-11 justify-center">
            <Clock3 className="size-4" aria-label="Duration" />
          </span>
          {onMove && <span className="size-8" aria-hidden="true" />}
          <span className="size-8" aria-hidden="true" />
        </span>
      </div>
      <div role="rowgroup" className="mt-1">
        {tracks.map((t, i) => {
          const isCurrent = !!current && current.Id === t.Id;
          const num = numbering === "track" ? t.IndexNumber ?? i + 1 : i + 1;
          const play = () => (isCurrent ? togglePlay() : playItems(tracks, i, source));
          return (
            <div
              key={t.PlaylistItemId ?? `${t.Id}-${i}`}
              role="row"
              data-reorder-index={onMove ? i : undefined}
              style={onMove ? rowStyle(i) : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx({ anchor: { x: e.clientX, y: e.clientY }, index: i });
              }}
              onClick={(e) => {
                // Clicking the row's empty space plays it; links/buttons inside keep their own action.
                if ((e.target as HTMLElement).closest("a, button, input")) return;
                play();
              }}
              className={cn(
                cols,
                "group h-14 cursor-pointer rounded-card hover:bg-overlay",
                drag?.from === i ? "relative z-10 bg-surface-raised shadow-xl shadow-black/40" : "transition-[transform,background-color] duration-150",
                isCurrent && "bg-overlay-strong hover:bg-overlay-strong",
              )}
            >
              <span role="cell" className="relative flex justify-center text-sm text-muted tabular-nums max-sm:hidden">
                <span className={cn("group-hover:invisible group-focus-within:invisible", isCurrent && "invisible")}>{num}</span>
                {isCurrent && (
                  <span className="absolute inset-0 flex items-center justify-center group-hover:invisible group-focus-within:invisible">
                    <EqualizerIcon playing={playing} />
                  </span>
                )}
                <button
                  type="button"
                  onClick={play}
                  aria-label={isCurrent && playing ? `Pause ${t.Name}` : `Play ${t.Name}`}
                  className="absolute inset-0 flex items-center justify-center text-text opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  {isCurrent && playing ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-4 fill-current" aria-hidden="true" />}
                </button>
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-3">
                {showArt && <TrackArt item={t} size={40} className="size-10" />}
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium", isCurrent ? "text-accent" : "text-text")}>{t.Name}</span>
                  <ArtistLinks item={t} className="block truncate text-xs text-muted" />
                </span>
              </span>
              {showAlbum && (
                <span role="cell" className="hidden min-w-0 truncate text-sm text-text-secondary md:block">
                  {t.AlbumId ? (
                    <Link href={`/music/album/${t.AlbumId}`} className="hover:text-text hover:underline">
                      {t.Album}
                    </Link>
                  ) : (
                    t.Album
                  )}
                </span>
              )}
              {showPlays && (
                <span role="cell" className="hidden text-right text-sm text-text-secondary tabular-nums md:block">
                  {t.UserData?.PlayCount ?? 0}
                </span>
              )}
              <span role="cell" className="flex items-center justify-end gap-1">
                <LikeButton item={t} size="sm" className="opacity-100 max-sm:hidden md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 aria-pressed:opacity-100" />
                <span className="w-11 text-center text-sm text-muted tabular-nums max-sm:hidden">{formatClock(ticksToSeconds(t.RunTimeTicks))}</span>
                {onMove && (
                  // Drag handle (touch + mouse); ↑/↓ on the keyboard. touch-none so dragging doesn't scroll.
                  <button
                    type="button"
                    aria-label={`Reorder ${t.Name} (drag, or use the arrow keys)`}
                    onPointerDown={(e) => onGrab(e, i)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" && i > 0) {
                        e.preventDefault();
                        onMove(t, i - 1);
                      } else if (e.key === "ArrowDown" && i < tracks.length - 1) {
                        e.preventDefault();
                        onMove(t, i + 1);
                      }
                    }}
                    className="inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-full text-muted hover:text-text focus-visible:opacity-100 active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100"
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                )}
                <TrackMenu tracks={[t]} label={t.Name ?? "track"} onRemove={onRemove ? () => onRemove(t) : undefined} />
              </span>
            </div>
          );
        })}
      </div>
      {ctx && ctxTrack && (
        <FloatingMenu anchor={ctx.anchor} onClose={() => setCtx(null)} label={ctxTrack.Name ?? "track"}>
          <TrackMenuBody
            getTracks={() => [ctxTrack]}
            single={ctxTrack}
            onRemove={onRemove ? () => onRemove(ctxTrack) : undefined}
            onClose={() => setCtx(null)}
          />
        </FloatingMenu>
      )}
    </div>
  );
}

export function TrackTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-1">
      <Skeleton className="mb-2 h-6 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 px-3">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="size-10" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
