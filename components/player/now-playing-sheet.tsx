"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListMusic, MicVocal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/states";
import { TrackMenu } from "@/components/music/track-menu";
import { Marquee } from "@/components/ui/marquee";
import { artColor } from "@/lib/player/art-color";
import { currentTrack, usePlayer } from "@/lib/player/store";
import { SeekBar } from "./seek-bar";
import { SleepTimerButton } from "./sleep-timer";
import { ArtistLinks, LikeButton, TrackArt } from "./track-bits";

/** Drag down at least this far to dismiss. */
const DISMISS_PX = 110;

/**
 * Full-screen Now Playing for phones (Spotify's expanded player): opened by
 * tapping the mini player. Big art, title, like, seek with times, transport,
 * and lyrics / queue / close. Dismiss with the chevron, Esc, or by dragging
 * it down.
 */
export function NowPlayingSheet({ onClose, onClosePlayer }: { onClose: () => void; onClosePlayer: () => void }) {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const source = usePlayer((s) => s.source);
  const { togglePlay, next, prev, toggleShuffle, cycleRepeat, setPanel } = usePlayer.getState();
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ y: number; active: boolean } | null>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  // Slide up on mount; Esc closes; focus the close button for keyboard users;
  // lock the page underneath so it can't scroll while this is open.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!track) return null;
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const noLyrics = track.HasLyrics === false;
  const tint = artColor(track, 1) ?? "var(--color-surface)";
  const openPanel = (p: "lyrics" | "queue") => {
    onClose();
    setPanel(p);
  };

  const ctrl = "inline-flex size-12 items-center justify-center rounded-full text-text-secondary transition active:scale-95";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      className={cn(
        "fixed inset-0 z-50 flex touch-none flex-col overflow-hidden overscroll-contain px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-text md:hidden",
        dragY ? "" : "transition-transform duration-300 ease-out",
      )}
      style={{
        background: `linear-gradient(to bottom, ${tint}, var(--color-bg) 85%)`,
        transform: shown ? `translateY(${dragY}px)` : "translateY(100%)",
      }}
      onTouchStart={(e) => {
        // Drag down anywhere to dismiss, except on the seek slider.
        if ((e.target as HTMLElement).closest("input")) return;
        drag.current = { y: e.touches[0].clientY, active: false };
      }}
      onTouchMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dy = e.touches[0].clientY - d.y;
        if (!d.active && dy > 8) d.active = true;
        if (d.active) setDragY(Math.max(0, dy));
      }}
      onTouchEnd={() => {
        const wasActive = drag.current?.active;
        drag.current = null;
        if (wasActive && dragY > DISMISS_PX) onClose();
        else setDragY(0);
      }}
    >
      <header className="flex items-center gap-3">
        <button ref={firstBtn} type="button" onClick={onClose} aria-label="Close Now Playing" className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-text">
          <ChevronDown className="size-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold tracking-wider text-text-secondary uppercase">{source ? "Playing from" : "Now playing"}</p>
          {source && (
            <p className="truncate text-sm font-bold">
              {source.href ? (
                <Link href={source.href} onClick={onClose}>
                  {source.label}
                </Link>
              ) : (
                source.label
              )}
            </p>
          )}
        </div>
        <TrackMenu tracks={[track]} label={track.Name ?? "track"} triggerClassName="-mr-2 size-10 text-text" />
      </header>

      {/* Art fills the space left over, as a square that fits both width and height (short phones too). */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-6 [container-type:size]">
        <TrackArt item={track} size={640} className="size-[min(100cqw,100cqh,26rem)] rounded-panel shadow-2xl shadow-black/50" />
      </div>

      <div className="mx-auto w-full max-w-[26rem]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Marquee className="font-display text-2xl font-bold">{track.Name}</Marquee>
            <Marquee className="text-base text-text-secondary">
              <ArtistLinks item={track} />
            </Marquee>
          </div>
          <LikeButton item={track} className="size-11" />
        </div>

        <div className="mt-5">
          <SeekBar variant="stacked" />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={cn(ctrl, shuffle && "text-accent")}>
            <Shuffle className="size-6" aria-hidden="true" />
          </button>
          <button type="button" onClick={prev} aria-label="Previous track" className={cn(ctrl, "text-text")}>
            <SkipBack className="size-8 fill-current" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="inline-flex size-[4.25rem] items-center justify-center rounded-full bg-text text-bg transition active:scale-95"
          >
            {buffering && playing ? (
              <Spinner className="size-6 border-bg/30 border-t-bg" label="Loading" />
            ) : playing ? (
              <Pause className="size-7 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-7 translate-x-0.5 fill-current" aria-hidden="true" />
            )}
          </button>
          <button type="button" onClick={() => next()} aria-label="Next track" className={cn(ctrl, "text-text")}>
            <SkipForward className="size-8 fill-current" aria-hidden="true" />
          </button>
          <button type="button" onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`} aria-pressed={repeat !== "off"} className={cn(ctrl, repeat !== "off" && "text-accent")}>
            <RepeatIcon className="size-6" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => openPanel("lyrics")}
            disabled={noLyrics}
            aria-label={noLyrics ? "No lyrics for this track" : "Lyrics"}
            className={cn(ctrl, "size-11 disabled:opacity-40")}
          >
            <MicVocal className="size-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={onClosePlayer} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-overlay-strong px-4 text-xs font-semibold text-text-secondary">
            <X className="size-3.5" aria-hidden="true" /> Close player
          </button>
          <div className="flex items-center">
            <SleepTimerButton className="size-11" iconClassName="size-5" />
            <button type="button" onClick={() => openPanel("queue")} aria-label="Queue" className={cn(ctrl, "size-11")}>
              <ListMusic className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
