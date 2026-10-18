"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ListMusic,
  MicVocal,
  MonitorSpeaker,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/states";
import { currentTrack, usePlayer } from "@/lib/player/store";
import { LyricsPanel } from "./lyrics-panel";
import { NowPlayingSheet } from "./now-playing-sheet";
import { SleepTimerButton } from "./sleep-timer";
import { SeekBar, Slider } from "./seek-bar";
import { QueuePanel } from "./queue-panel";
import { ArtistLinks, LikeButton, TrackArt } from "./track-bits";

/** ↑/↓ volume changes ask the slider to show its percent bubble briefly. */
const volumeKeyFlash = new EventTarget();

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const [showTip, setShowTip] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const on = () => {
      setFlash(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setFlash(false), 1200);
    };
    volumeKeyFlash.addEventListener("flash", on);
    return () => {
      volumeKeyFlash.removeEventListener("flash", on);
      window.clearTimeout(t);
    };
  }, []);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const pct = Math.round((muted ? 0 : volume) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className={iconBtn}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </button>
      {/* Percent tooltip while hovering, dragging or focused. */}
      <div
        className="relative flex w-24 items-center"
        onPointerEnter={() => setShowTip(true)}
        onPointerLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
      >
        {(showTip || flash) && (
          <span
            aria-hidden="true"
            className="jelly-panel pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold text-text tabular-nums"
            style={{ left: `${pct}%` }}
          >
            {pct}%
          </span>
        )}
        <Slider value={muted ? 0 : volume} max={1} keyStep={0.05} onChange={setVolume} label="Volume" valueText={`${pct}%`} />
      </div>
    </div>
  );
}

const iconBtn =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text disabled:pointer-events-none disabled:opacity-40";

/**
 * Persistent bottom player (jelly glass). Hidden when the queue is empty.
 * Desktop: art/title/like · transport + seek · lyrics/queue/devices/volume.
 * Phone: art/title · play/next, with a thin seek bar along the top.
 */
export function PlayerBar() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const panel = usePlayer((s) => s.panel);
  const error = usePlayer((s) => s.error);
  const { togglePlay, next, prev, toggleShuffle, cycleRepeat, setPanel } = usePlayer.getState();
  // Close: slide the bar away, then clear the queue (the toast offers Undo).
  const [leaving, setLeaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    closeTimer.current = window.setTimeout(() => {
      usePlayer.getState().close();
      setLeaving(false);
    }, 220);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Keyboard: Space = play/pause, ←/→ = seek 5s, ↑/↓ = volume ±5%. Ignored
  // while typing, on focused controls that use those keys themselves, or with modifiers.
  useEffect(() => {
    if (!track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="menu"], [role="listbox"], [role="dialog"]')) return;
      const s = usePlayer.getState();
      if (e.key === " " || e.code === "Space") {
        if (target?.closest("button, a, [role='button'], summary")) return;
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (target?.closest("[role='group'], [role='tablist']")) return;
        e.preventDefault();
        s.seek(Math.min(Math.max(0, s.currentTime + (e.key === "ArrowRight" ? 5 : -5)), s.duration || Infinity));
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = s.muted ? 0 : s.volume;
        s.setVolume(Math.round(Math.min(1, Math.max(0, cur + (e.key === "ArrowUp" ? 0.05 : -0.05))) * 100) / 100);
        volumeKeyFlash.dispatchEvent(new Event("flash"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [track]);

  // Publish the bar's real footprint (viewport bottom → bar top) as
  // --player-space so pages and the music shell end exactly above it.
  const barRef = useRef<HTMLElement>(null);
  const hasTrack = !!track;
  useEffect(() => {
    const html = document.documentElement;
    html.toggleAttribute("data-player", hasTrack);
    const bar = barRef.current;
    if (!hasTrack || !bar) {
      html.style.removeProperty("--player-space");
      return;
    }
    const measure = () => html.style.setProperty("--player-space", `${Math.ceil(window.innerHeight - bar.getBoundingClientRect().top)}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    window.addEventListener("resize", measure);
    // Music's phone tab bar lifts the bar without resizing it.
    const mo = new MutationObserver(() => requestAnimationFrame(measure));
    mo.observe(html, { attributes: true, attributeFilter: ["data-music-tabs"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
      html.removeAttribute("data-player");
      html.style.removeProperty("--player-space");
    };
  }, [hasTrack]);

  if (!track) return <ClosedToast />;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  // Jellyfin's HasLyrics; unknown (e.g. an older restored queue) leaves the button enabled.
  const noLyrics = track.HasLyrics === false;
  const albumHref = track.AlbumId ? `/music/album/${track.AlbumId}` : undefined;

  return (
    <>
      {panel === "queue" && <QueuePanel />}
      {/* Keyed by track: a new track remounts the panel (follow mode + scroll reset). */}
      {panel === "lyrics" && <LyricsPanel key={track.uid} />}
      {sheetOpen && (
        <NowPlayingSheet
          onClose={closeSheet}
          onClosePlayer={() => {
            setSheetOpen(false);
            close();
          }}
        />
      )}
      <section
        ref={barRef}
        aria-label="Music player"
        className={cn(
          "jelly fixed inset-x-2 bottom-[calc(var(--tabs-space,0px)+0.5rem)] z-40 rounded-panel px-3 pt-2 pb-2 transition-[translate,opacity] duration-200 ease-in sm:inset-x-3 sm:bottom-[calc(var(--tabs-space,0px)+0.75rem)] md:px-4 md:py-2.5",
          leaving && "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0",
        )}
      >
        {/* Phone: thin seek along the top edge */}
        <div className="md:hidden">
          <SeekBar variant="compact" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          {/* Now playing. Hovering (or tabbing into) it reveals Close; paused keeps Close visible. */}
          <div className="group/np -my-1 -ml-1.5 flex max-w-full min-w-0 items-center gap-3 justify-self-start rounded-card py-1 pr-1.5 pl-1.5 transition-colors hover:bg-overlay focus-within:bg-overlay">
            <div className="relative flex min-w-0 items-center gap-3">
              {albumHref ? (
                <Link href={albumHref} aria-label={`Open album ${track.Album ?? ""}`} className="shrink-0">
                  <TrackArt item={track} size={56} className="size-12 md:size-14" />
                </Link>
              ) : (
                <TrackArt item={track} size={56} className="size-12 md:size-14" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{track.Name}</p>
                <p className="truncate text-xs text-muted">
                  {error ? <span className="text-danger">{error}</span> : <ArtistLinks item={track} />}
                </p>
              </div>
              {/* Phone: tap the mini player to open the full-screen Now Playing. */}
              <button type="button" onClick={() => setSheetOpen(true)} aria-label="Open Now Playing" className="absolute inset-0 md:hidden" />
            </div>
            <LikeButton item={track} className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={close}
              aria-label="Close player"
              title="Close player"
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-overlay-strong text-text-secondary transition hover:text-text focus-visible:opacity-100",
                playing ? "opacity-0 group-hover/np:opacity-100 group-focus-within/np:opacity-100" : "opacity-100",
              )}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Transport */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1 sm:gap-2">
              <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={cn(iconBtn, "hidden md:inline-flex", shuffle && "text-accent hover:text-accent")}>
                <Shuffle className="size-[18px]" aria-hidden="true" />
              </button>
              <button type="button" onClick={prev} aria-label="Previous track" className={cn(iconBtn, "hidden sm:inline-flex")}>
                <SkipBack className="size-[18px] fill-current" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="inline-flex size-10 items-center justify-center rounded-full bg-text text-bg transition hover:scale-105"
              >
                {buffering && playing ? (
                  <Spinner className="size-4 border-bg/30 border-t-bg" label="Loading" />
                ) : playing ? (
                  <Pause className="size-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="size-4 translate-x-px fill-current" aria-hidden="true" />
                )}
              </button>
              <button type="button" onClick={() => next()} aria-label="Next track" className={iconBtn}>
                <SkipForward className="size-[18px] fill-current" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setPanel("queue")} aria-label="Queue" aria-pressed={panel === "queue"} className={cn(iconBtn, "md:hidden")}>
                <ListMusic className="size-[18px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={cycleRepeat}
                aria-label={`Repeat: ${repeat}`}
                aria-pressed={repeat !== "off"}
                className={cn(iconBtn, "hidden md:inline-flex", repeat !== "off" && "text-accent hover:text-accent")}
              >
                <RepeatIcon className="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            <div className="hidden w-full max-w-xl md:block">
              <SeekBar />
            </div>
          </div>

          {/* Extras */}
          <div className="hidden items-center justify-end gap-1 md:flex">
            <SleepTimerButton />
            <button
              type="button"
              onClick={() => setPanel("lyrics")}
              disabled={noLyrics}
              aria-label={noLyrics ? "No lyrics for this track" : "Lyrics"}
              title={noLyrics ? "No lyrics for this track" : "Lyrics"}
              aria-pressed={panel === "lyrics"}
              className={cn(iconBtn, panel === "lyrics" && "text-accent hover:text-accent")}
            >
              <MicVocal className="size-[18px]" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPanel("queue")} aria-label="Queue" aria-pressed={panel === "queue"} className={cn(iconBtn, panel === "queue" && "text-accent hover:text-accent")}>
              <ListMusic className="size-[18px]" aria-hidden="true" />
            </button>
            <button type="button" disabled aria-label="Play on another device (not available)" title="Casting isn't supported" className={iconBtn}>
              <MonitorSpeaker className="size-[18px]" aria-hidden="true" />
            </button>
            <VolumeControl />
          </div>
        </div>
      </section>
    </>
  );
}

/** After closing: "Playback closed · Undo" where the bar was, for a few seconds. */
function ClosedToast() {
  const closed = usePlayer((s) => s.closed);
  const { undoClose, dismissClosed } = usePlayer.getState();
  useEffect(() => {
    if (!closed) return;
    const t = window.setTimeout(dismissClosed, 6000);
    return () => window.clearTimeout(t);
  }, [closed, dismissClosed]);
  if (!closed) return null;
  return (
    <div role="status" className="jelly-panel fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full py-2 pr-2 pl-5 text-sm text-text shadow-lg sm:bottom-6">
      Playback closed
      <button type="button" onClick={undoClose} className="rounded-full px-3 py-1 font-semibold text-accent transition hover:bg-overlay">
        Undo
      </button>
    </div>
  );
}
