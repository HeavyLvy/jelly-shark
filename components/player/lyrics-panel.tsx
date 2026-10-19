"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { Expand, LocateFixed, Maximize2, Minimize2, Pause, Play, Shrink, SkipBack, SkipForward, X } from "lucide-react";
import type { LyricDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLyricApi } from "@jellyfin/sdk/lib/utils/api/lyric-api";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import { TICKS_PER_SECOND } from "@/lib/format";
import { jf } from "@/lib/jellyfin/client";
import { useJfQuery } from "@/lib/queries/use-jf-query";
import { artColor } from "@/lib/player/art-color";
import { exitLyricsFullscreen, setLyricsMode, useLyricsMode, type LyricsMode } from "@/lib/player/lyrics-view";
import { SeekBar } from "./seek-bar";
import { currentTrack, usePlayer } from "@/lib/player/store";

/**
 * Spotify-style lyrics.
 *
 * Synced lyrics: lines already sung and the current line are bright, upcoming
 * lines are dim; hovering a line brightens it; clicking a line plays from it.
 * The current line is kept centred. Scrolling by hand (wheel, touch, keys,
 * scrollbar) stops following and shows "Sync"; following resumes on Sync, on
 * clicking a line, or when the user has stopped scrolling for RESUME_DELAY_MS
 * with the current line near the middle (every scroll restarts that delay).
 * Instrumental gaps show three dots that fill as the gap plays out.
 *
 * Unsynced lyrics are shown as plain text with a note, like Spotify.
 */

/** After the user stops scrolling this long near the current line, follow resumes. */
const RESUME_DELAY_MS = 1500;
/** "Near the middle": current line within this fraction of the panel height from centre. */
const RESUME_BAND = 0.25;

/** A gap at least this long between lines (or before the first) shows the dots. */
const PAUSE_MIN_SECONDS = 5;

interface Line {
  text: string;
  /** Start in seconds (song time), null for unsynced lyrics. */
  start: number | null;
  /** Instrumental gap (rendered as dots). */
  pause: boolean;
}

/**
 * Jellyfin's Metadata.IsSynced is often missing even when every line has a
 * timestamp (seen on 12.2 with .lrc files), so trust the timestamps.
 */
function buildLines(data: LyricDto | null | undefined): { lines: Line[]; synced: boolean } {
  const raw = data?.Lyrics ?? [];
  const offset = (data?.Metadata?.Offset ?? 0) / TICKS_PER_SECOND;
  const timed = raw.filter((l) => typeof l.Start === "number");
  const synced =
    data?.Metadata?.IsSynced === true ||
    (data?.Metadata?.IsSynced !== false && raw.length > 1 && timed.length >= raw.length * 0.8 && timed.some((l) => (l.Start ?? 0) > 0));

  const isPause = (t: string) => !t || t === "♪" || /^[♪\s.…]+$/.test(t);

  if (!synced) {
    return { lines: raw.map((l) => ({ text: (l.Text ?? "").trim(), start: null, pause: false })), synced: false };
  }

  const timedLines = raw
    .filter((l) => typeof l.Start === "number")
    .map((l) => ({ text: (l.Text ?? "").trim(), start: Math.max(0, (l.Start ?? 0) / TICKS_PER_SECOND - offset) }))
    .sort((a, b) => a.start - b.start);

  const out: Line[] = [];
  // Intro before the first sung line.
  const firstSung = timedLines.find((l) => !isPause(l.text));
  if (firstSung && firstSung.start >= PAUSE_MIN_SECONDS) out.push({ text: "", start: 0, pause: true });
  timedLines.forEach((l, i) => {
    if (isPause(l.text)) {
      // Keep a pause only before more singing (no dots for the outro), if it's
      // long enough, and not right after another pause.
      const nextSung = timedLines.slice(i + 1).find((n) => !isPause(n.text));
      if (nextSung && nextSung.start - l.start >= PAUSE_MIN_SECONDS && !out.at(-1)?.pause) out.push({ text: "", start: l.start, pause: true });
      return;
    }
    out.push({ text: l.text, start: l.start, pause: false });
  });
  return { lines: out, synced: true };
}

/** Index of the line playing at `t` (binary search over sorted starts), -1 before the first. */
function lineAt(lines: Line[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].start ?? Infinity) <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return idx;
}

/**
 * Current line, updated every frame. The engine reports time ~4×/s, so between
 * reports the time is extrapolated while playing (capped at 1s past the last
 * report so a stall can't run ahead). Only re-renders when the line changes.
 */
function useActiveLine(lines: Line[], enabled: boolean) {
  // Starts on the line playing right now (not -1), so opening the panel mid-song
  // centres there at once instead of centring line 0 and then gliding to the real line.
  const [state, setState] = useState(() => ({ lines, idx: lineAt(lines, usePlayer.getState().currentTime) }));
  if (state.lines !== lines) setState({ lines, idx: lineAt(lines, usePlayer.getState().currentTime) });
  const active = state.lines === lines ? state.idx : lineAt(lines, usePlayer.getState().currentTime);
  const clock = useRef({ t: 0, at: 0, playing: false });

  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      const s = usePlayer.getState();
      clock.current = { t: s.currentTime, at: performance.now(), playing: s.playing && !s.buffering };
    };
    sync();
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.currentTime !== prev.currentTime || s.playing !== prev.playing || s.buffering !== prev.buffering) sync();
    });
    let raf = 0;
    const tick = () => {
      const c = clock.current;
      const t = c.playing ? c.t + Math.min(1, (performance.now() - c.at) / 1000) : c.t;
      const idx = lineAt(lines, t);
      setState((prev) => (prev.lines === lines && prev.idx === idx ? prev : { lines, idx }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [lines, enabled]);

  /** Extrapolated song time now (for one-off reads, e.g. where in a gap we are). */
  const now = useCallback(() => {
    const c = clock.current;
    return c.playing ? c.t + Math.min(1, (performance.now() - c.at) / 1000) : c.t;
  }, []);

  return { active: enabled ? active : -1, now };
}

/** Lyrics text for the current track. Remounted per track (follow mode and scroll start fresh). */
function LyricsBody({ mode }: { mode: LyricsMode }) {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const { seek, setPlaying } = usePlayer.getState();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const [follow, setFollow] = useState(true);
  const userScrolling = useRef(false);
  const resumeTimer = useRef<number | undefined>(undefined);
  const activeRef = useRef(-1);
  const firstScroll = useRef(true);
  const itemId = track?.Id ?? "";

  const lyrics = useJfQuery({
    queryKey: ["jf", "lyrics", itemId],
    enabled: !!itemId,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      try {
        return (await getLyricApi(jf).getLyrics({ itemId }, { signal })).data;
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 404) return null;
        throw err;
      }
    },
  });

  const { lines, synced } = useMemo(() => buildLines(lyrics.data), [lyrics.data]);
  const { active, now } = useActiveLine(lines, synced);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  /** Centre a line (ours, so it never counts as the user scrolling). */
  const centreLine = useCallback((index: number, instant = false) => {
    const scroller = scrollerRef.current;
    const el = lineRefs.current[index];
    if (!scroller || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2;
    scroller.scrollTo({ top, behavior: instant || firstScroll.current || reduce ? "auto" : "smooth" });
    firstScroll.current = false;
  }, []);

  /** (Re)start the resume delay; when it runs out, follow again if the current line is near the middle. */
  const armResume = useCallback(() => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      const scroller = scrollerRef.current;
      const el = lineRefs.current[activeRef.current];
      if (!scroller || !el || !userScrolling.current) return;
      const centre = scroller.scrollTop + scroller.clientHeight / 2;
      if (Math.abs(centre - (el.offsetTop + el.offsetHeight / 2)) < scroller.clientHeight * RESUME_BAND) {
        userScrolling.current = false;
        setFollow(true);
      }
    }, RESUME_DELAY_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  // Follow the current line (index 0 when nothing has started yet).
  useEffect(() => {
    if (synced && follow && lines.length) centreLine(Math.max(0, active));
  }, [active, follow, synced, lines.length, centreLine]);

  // Only real user input stops following; our own smooth scrolls never do.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !synced) return;
    const userInput = () => {
      userScrolling.current = true;
      setFollow(false);
      armResume();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && e.target === el) userInput();
    };
    // A press on the scroller itself (not a line) is a scrollbar drag.
    const onPointer = (e: PointerEvent) => e.target === el && userInput();
    el.addEventListener("wheel", userInput, { passive: true });
    el.addEventListener("touchmove", userInput, { passive: true });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", onPointer);
    return () => {
      el.removeEventListener("wheel", userInput);
      el.removeEventListener("touchmove", userInput);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onPointer);
    };
  }, [synced, lyrics.data, armResume]);

  // Any scroll while the user is in control (including momentum after a
  // flick) restarts the delay, so follow never snaps back mid-scroll.
  const onScroll = () => {
    if (userScrolling.current) armResume();
  };

  const resync = () => {
    window.clearTimeout(resumeTimer.current);
    userScrolling.current = false;
    setFollow(true);
    if (active >= 0) centreLine(active);
  };

  const playFrom = (start: number) => {
    seek(start);
    if (!playing) setPlaying(true);
    window.clearTimeout(resumeTimer.current);
    userScrolling.current = false;
    setFollow(true);
  };

  // Resizing (changing mode, entering fullscreen, rotating) moves the lines: keep the current one centred.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (follow && synced && lines.length) centreLine(Math.max(0, activeRef.current), true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [follow, synced, lines.length, centreLine]);

  const empty = lyrics.data === null || (lyrics.data && lines.length === 0);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} onScroll={onScroll} tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto px-6 outline-none scrollbar-thin">
        {lyrics.isPending && <Spinner className="m-6 size-6" label="Loading lyrics" />}
        {lyrics.isError && <ErrorState title="Couldn't load lyrics" action={<button type="button" className="text-accent" onClick={() => void lyrics.refetch()}>Retry</button>} />}
        {empty ? <EmptyState title="No lyrics for this track" /> : null}
        {lines.length > 0 && !synced && <p className="mx-auto max-w-4xl pt-2 text-center text-sm text-text-secondary">These lyrics aren&apos;t synced to the song yet.</p>}
        {lines.length > 0 && (
          <ol className={cn("mx-auto text-center", mode === "panel" ? "max-w-4xl space-y-5" : mode === "expanded" ? "max-w-6xl space-y-7" : "max-w-7xl space-y-9", synced ? "py-[40vh]" : "py-8")}>
            {lines.map((line, i) => {
              const state = !synced ? "plain" : i < active ? "past" : i === active ? "active" : "future";
              const lineCls = cn(
                "font-display leading-snug font-bold tracking-tight transition-colors duration-300",
                mode === "panel" ? "text-[1.75rem] sm:text-4xl" : mode === "expanded" ? "text-3xl sm:text-5xl lg:text-6xl" : "text-4xl sm:text-6xl xl:text-7xl",
                state === "future" ? "text-text/40 hover:text-text" : "text-text",
              );
              return (
                <li key={i} ref={(el) => void (lineRefs.current[i] = el)}>
                  {synced && line.start !== null ? (
                    <button
                      type="button"
                      onClick={() => playFrom(line.start ?? 0)}
                      aria-current={state === "active" ? "true" : undefined}
                      aria-label={line.pause ? "Instrumental" : undefined}
                      className={cn(lineCls, "cursor-pointer rounded-card px-2 outline-offset-4")}
                    >
                      {line.pause ? (
                        <PauseDots
                          key={state === "active" ? "on" : "off"}
                          start={line.start}
                          end={lines[i + 1]?.start ?? line.start + PAUSE_MIN_SECONDS}
                          active={state === "active"}
                          playing={playing}
                          now={now}
                        />
                      ) : (
                        line.text
                      )}
                    </button>
                  ) : (
                    <p className={lineCls}>{line.text || " "}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {synced && !follow && (
        <button
          type="button"
          onClick={resync}
          className={cn("jelly-control absolute left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-text", mode === "fullscreen" ? "bottom-40" : "bottom-4")}
        >
          <LocateFixed className="size-4" aria-hidden="true" /> Sync
        </button>
      )}
    </div>
  );
}

const iconBtn = "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text";

/**
 * The lyrics frame: title and view controls around the (per-track) lyrics.
 * Stays mounted across tracks so browser fullscreen isn't dropped at every
 * song change. See lib/player/lyrics-view.ts for the three modes.
 */
export function LyricsPanel() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const { setPanel, togglePlay, next, prev } = usePlayer.getState();
  const mode = useLyricsMode();
  const frameRef = useRef<HTMLElement>(null);
  /** Fullscreen: controls fade out after a few seconds without input. */
  const [awake, setAwake] = useState(true);
  const tint = useMemo(() => artColor(track), [track]);
  const solid = mode !== "panel";
  const full = mode === "fullscreen";

  // Browser fullscreen follows the mode. Without the API (iPhone) the cover
  // still fills the page, so the mode works either way.
  const browserFullscreen = useRef(false);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (full) {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        el.requestFullscreen().then(
          () => void (browserFullscreen.current = true),
          () => void (browserFullscreen.current = false),
        );
      }
    } else if (document.fullscreenElement === el) {
      browserFullscreen.current = false;
      void document.exitFullscreen();
    }
  }, [full]);
  // Esc (or the browser's own exit) leaves browser fullscreen: step back a mode too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && browserFullscreen.current) {
        browserFullscreen.current = false;
        exitLyricsFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  // Closing the panel from fullscreen must not leave it armed to reopen fullscreen.
  useEffect(() => () => exitLyricsFullscreen(), []);

  // Esc steps back: fullscreen → where it came from → panel → closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "fullscreen") exitLyricsFullscreen();
      else if (mode === "expanded") setLyricsMode("panel");
      else setPanel("lyrics");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, setPanel]);

  // Fullscreen: wake the controls on any input, hide them after 3 s of none.
  useEffect(() => {
    const el = frameRef.current;
    if (!full || !el) return;
    let timer = window.setTimeout(() => setAwake(false), 3000);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), 3000);
    };
    const events = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    events.forEach((n) => el.addEventListener(n, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((n) => el.removeEventListener(n, wake));
    };
  }, [full]);
  const hidden = full && !awake;

  const enterFullscreen = () => {
    setAwake(true);
    setLyricsMode("fullscreen");
  };

  return (
    <aside
      ref={frameRef}
      aria-label="Lyrics"
      style={tint ? (solid ? { backgroundColor: "var(--color-bg)", backgroundImage: `linear-gradient(${tint}, ${tint})` } : { backgroundColor: tint }) : undefined}
      className={cn(
        "flex flex-col transition-[background-color] duration-700",
        mode === "panel" && "jelly-panel fixed inset-x-0 top-20 bottom-[calc(var(--player-space)+0.5rem)] z-40 mx-auto w-[min(72rem,calc(100vw-1rem))] rounded-panel",
        mode === "expanded" && "fixed inset-x-0 top-[4.5rem] bottom-[calc(var(--player-space)+0.5rem)] z-40 border-t border-hairline",
        full && "fixed inset-0 z-[100]",
        solid && !tint && "bg-bg",
        hidden && "cursor-none",
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-3 px-6 pt-5 pb-3 transition-opacity duration-500",
          full && "pt-[max(1.25rem,env(safe-area-inset-top))]",
          hidden && "pointer-events-none opacity-0",
        )}
      >
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">{full ? track?.Name : "Lyrics"}</h2>
          <p className="truncate text-sm text-text-secondary">{full ? track?.Artists?.join(", ") || track?.AlbumArtist || "" : track ? `${track.Name} · ${track.Artists?.join(", ") || track.AlbumArtist || ""}` : ""}</p>
        </div>
        <div className="flex items-center gap-1">
          {!full && (
            <button
              type="button"
              aria-label={mode === "expanded" ? "Shrink lyrics" : "Expand lyrics"}
              onClick={() => setLyricsMode(mode === "expanded" ? "panel" : "expanded")}
              className={iconBtn}
            >
              {mode === "expanded" ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
            </button>
          )}
          <button type="button" aria-label={full ? "Exit full screen" : "Full screen lyrics"} onClick={() => (full ? exitLyricsFullscreen() : enterFullscreen())} className={iconBtn}>
            {full ? <Shrink className="size-4" aria-hidden="true" /> : <Expand className="size-4" aria-hidden="true" />}
          </button>
          {!full && (
            <button type="button" aria-label="Close lyrics" onClick={() => setPanel("lyrics")} className={iconBtn}>
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <LyricsBody key={track?.uid} mode={mode} />
      {full && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-linear-to-t from-black/60 to-transparent px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))] transition-opacity duration-500 *:pointer-events-auto",
            hidden && "opacity-0 *:pointer-events-none",
          )}
        >
          <div className="flex items-center gap-3">
            <button type="button" onClick={prev} aria-label="Previous track" className={iconBtn}>
              <SkipBack className="size-5 fill-current" aria-hidden="true" />
            </button>
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="inline-flex size-12 items-center justify-center rounded-full bg-text text-bg transition hover:scale-105">
              {buffering && playing ? <Spinner className="size-5 border-bg/30 border-t-bg" label="Loading" /> : playing ? <Pause className="size-5 fill-current" aria-hidden="true" /> : <Play className="size-5 translate-x-px fill-current" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => next()} aria-label="Next track" className={iconBtn}>
              <SkipForward className="size-5 fill-current" aria-hidden="true" />
            </button>
          </div>
          <div className="w-full max-w-2xl">
            <SeekBar />
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * Instrumental gap: three dots that light up one by one across the gap (like
 * Spotify). Driven by a CSS animation started at the right point, so it costs
 * nothing per frame and pauses with the music.
 */
function PauseDots({
  start,
  end,
  active,
  playing,
  now,
}: {
  start: number;
  end: number;
  active: boolean;
  playing: boolean;
  now: () => number;
}) {
  const duration = Math.max(1, end - start);
  // Where in the gap we are when it becomes active (e.g. after a seek). The
  // parent remounts this on activation, so it's read once.
  const [elapsed] = useState(() => (active ? Math.min(duration, Math.max(0, now() - start)) : 0));
  return (
    <span className="inline-flex h-[1em] items-center gap-3 align-middle" aria-hidden="true">
      {[0, 1, 2].map((d) => (
        <span
          key={d}
          className="size-3.5 rounded-full bg-current opacity-35"
          style={
            active
              ? {
                  animation: `lyric-dot-${d} ${duration}s linear forwards`,
                  animationDelay: `${-elapsed}s`,
                  animationPlayState: playing ? "running" : "paused",
                }
              : undefined
          }
        />
      ))}
    </span>
  );
}
