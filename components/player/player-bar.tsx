"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/states";
import { formatClock } from "@/lib/format";
import { currentTrack, usePlayer } from "@/lib/player/store";
import { LyricsPanel } from "./lyrics-panel";
import { QueuePanel } from "./queue-panel";
import { ArtistLinks, LikeButton, TrackArt } from "./track-bits";

/** Range input styled as a thin accent bar (seek + volume). */
function Slider({
  value,
  max,
  onChange,
  onCommit,
  label,
  valueText,
  className,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  valueText?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      min={0}
      max={max || 1}
      step="any"
      value={Math.min(value, max || 1)}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      style={{ "--pct": `${pct}%` } as CSSProperties}
      className={cn(
        "jelly-range h-4 w-full cursor-pointer appearance-none bg-transparent",
        className,
      )}
    />
  );
}

function SeekBar({ compact }: { compact?: boolean }) {
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  // While dragging, show the drag position instead of live playback time.
  const [drag, setDrag] = useState<number | null>(null);
  // Pointer hover position (fraction 0–1) for the time tooltip.
  const [hover, setHover] = useState<number | null>(null);
  const shown = drag ?? currentTime;
  return (
    <div className={cn("flex w-full items-center gap-2 text-[11px] text-muted tabular-nums", compact && "gap-0")}>
      {!compact && <span className="w-10 text-right">{formatClock(shown)}</span>}
      <div
        className="relative flex flex-1 items-center"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {hover !== null && duration > 0 && (
          <span
            aria-hidden="true"
            className="jelly-panel pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold text-text"
            style={{ left: `${hover * 100}%` }}
          >
            {formatClock(hover * duration)}
          </span>
        )}
      <Slider
        value={shown}
        max={duration}
        label="Seek"
        valueText={`${formatClock(shown)} of ${formatClock(duration)}`}
        onChange={setDrag}
        onCommit={(v) => {
          seek(v);
          setDrag(null);
        }}
      />
      </div>
      {!compact && <span className="w-10">{formatClock(duration)}</span>}
    </div>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const [showTip, setShowTip] = useState(false);
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
        {showTip && (
          <span
            aria-hidden="true"
            className="jelly-panel pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold text-text tabular-nums"
            style={{ left: `${pct}%` }}
          >
            {pct}%
          </span>
        )}
        <Slider value={muted ? 0 : volume} max={1} onChange={setVolume} label="Volume" valueText={`${pct}%`} />
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
  const { togglePlay, next, prev, toggleShuffle, cycleRepeat, setPanel, stop } = usePlayer.getState();

  // Keyboard: Space = play/pause, ←/→ = seek 5s. Ignored while typing, on
  // focused controls that use those keys themselves, or with modifiers.
  useEffect(() => {
    if (!track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="menu"], [role="dialog"]')) return;
      const s = usePlayer.getState();
      if (e.key === " " || e.code === "Space") {
        if (target?.closest("button, a, [role='button'], summary")) return;
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (target?.closest("[role='group'], [role='tablist']")) return;
        e.preventDefault();
        s.seek(Math.min(Math.max(0, s.currentTime + (e.key === "ArrowRight" ? 5 : -5)), s.duration || Infinity));
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
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      html.removeAttribute("data-player");
      html.style.removeProperty("--player-space");
    };
  }, [hasTrack]);

  if (!track) return null;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  // Jellyfin's HasLyrics; unknown (e.g. an older restored queue) leaves the button enabled.
  const noLyrics = track.HasLyrics === false;
  const albumHref = track.AlbumId ? `/music/album/${track.AlbumId}` : undefined;

  return (
    <>
      {panel === "queue" && <QueuePanel />}
      {/* Keyed by track: a new track remounts the panel (follow mode + scroll reset). */}
      {panel === "lyrics" && <LyricsPanel key={track.uid} />}
      <section
        ref={barRef}
        aria-label="Music player"
        className="jelly fixed inset-x-2 bottom-2 z-40 rounded-panel px-3 pt-2 pb-2 sm:inset-x-3 sm:bottom-3 md:px-4 md:py-2.5"
      >
        {/* Phone: thin seek along the top edge */}
        <div className="md:hidden">
          <SeekBar compact />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          {/* Now playing */}
          <div className="flex min-w-0 items-center gap-3">
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
            <LikeButton item={track} className="hidden sm:inline-flex" />
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
              <button type="button" onClick={stop} aria-label="Stop and close player" title="Stop" className={cn(iconBtn, "hidden md:inline-flex")}>
                <Square className="size-4 fill-current" aria-hidden="true" />
              </button>
            </div>
            <div className="hidden w-full max-w-xl md:block">
              <SeekBar />
            </div>
          </div>

          {/* Extras */}
          <div className="hidden items-center justify-end gap-1 md:flex">
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
