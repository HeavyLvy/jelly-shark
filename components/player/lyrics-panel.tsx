"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { LocateFixed, X } from "lucide-react";
import { getLyricApi } from "@jellyfin/sdk/lib/utils/api/lyric-api";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import { TICKS_PER_SECOND } from "@/lib/format";
import { jf } from "@/lib/jellyfin/client";
import { useJfQuery } from "@/lib/queries/use-jf-query";
import { currentTrack, usePlayer } from "@/lib/player/store";

/**
 * Lyrics, centred on screen. Synced lyrics highlight the current line and
 * keep it centred. Scrolling by hand pauses the auto-follow; it resumes when
 * the user scrolls back near the highlighted line, clicks a line, or presses
 * "Back to current line".
 */
export function LyricsPanel() {
  const track = usePlayer(currentTrack);
  const currentTime = usePlayer((s) => s.currentTime);
  const { setPanel, seek } = usePlayer.getState();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const programmatic = useRef(false);
  const programmaticTimer = useRef<number | undefined>(undefined);
  const [follow, setFollow] = useState(true);
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

  const lines = useMemo(() => lyrics.data?.Lyrics?.filter((l) => l.Text !== undefined) ?? [], [lyrics.data]);
  const synced = !!lyrics.data?.Metadata?.IsSynced && lines.some((l) => typeof l.Start === "number");
  const offset = (lyrics.data?.Metadata?.Offset ?? 0) / TICKS_PER_SECOND;

  const activeIndex = useMemo(() => {
    if (!synced) return -1;
    const t = currentTime + offset;
    let idx = -1;
    lines.forEach((l, i) => {
      if (typeof l.Start === "number" && l.Start / TICKS_PER_SECOND <= t) idx = i;
    });
    return idx;
  }, [synced, lines, currentTime, offset]);

  /** Smoothly centre a line, marking the scroll as ours so it doesn't cancel follow mode. */
  const centreLine = useCallback((index: number, smooth = true) => {
    const scroller = scrollerRef.current;
    const el = lineRefs.current[index];
    if (!scroller || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2;
    programmatic.current = true;
    window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(() => (programmatic.current = false), smooth && !reduce ? 700 : 80);
    scroller.scrollTo({ top, behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  // Follow the active line.
  useEffect(() => {
    if (follow && activeIndex >= 0) centreLine(activeIndex);
  }, [activeIndex, follow, centreLine]);

  const onScroll = () => {
    if (programmatic.current || !synced) return;
    const scroller = scrollerRef.current;
    const el = activeIndex >= 0 ? lineRefs.current[activeIndex] : null;
    if (!scroller) return;
    if (follow) {
      setFollow(false);
      return;
    }
    // User scrolled back to (near) the highlighted line → resume following.
    if (el) {
      const centre = scroller.scrollTop + scroller.clientHeight / 2;
      const lineCentre = el.offsetTop + el.offsetHeight / 2;
      if (Math.abs(centre - lineCentre) < scroller.clientHeight * 0.18) setFollow(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel("lyrics");
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(programmaticTimer.current);
    };
  }, [setPanel]);

  return (
    <aside
      aria-label="Lyrics"
      className="jelly-panel fixed inset-x-0 top-20 bottom-[calc(var(--player-space)+0.5rem)] z-40 mx-auto flex w-[min(72rem,calc(100vw-1rem))] flex-col rounded-panel"
    >
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">Lyrics</h2>
          <p className="truncate text-sm text-muted">{track ? `${track.Name} · ${track.Artists?.join(", ") || track.AlbumArtist || ""}` : ""}</p>
        </div>
        <button type="button" aria-label="Close lyrics" onClick={() => setPanel("lyrics")} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      <div ref={scrollerRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-6">
        {lyrics.isPending && <Spinner className="m-6 size-6" label="Loading lyrics" />}
        {lyrics.isError && <ErrorState title="Couldn't load lyrics" action={<button type="button" className="text-accent" onClick={() => void lyrics.refetch()}>Retry</button>} />}
        {lyrics.data === null || (lyrics.data && lines.length === 0) ? <EmptyState title="No lyrics for this track" /> : null}
        {lines.length > 0 && (
          <ol className="mx-auto max-w-4xl space-y-4 py-[35vh] text-center">
            {lines.map((line, i) => {
              const start = typeof line.Start === "number" ? line.Start / TICKS_PER_SECOND - offset : null;
              const text = line.Text?.trim() || "♪";
              const active = i === activeIndex;
              return (
                <li key={i} ref={(el) => void (lineRefs.current[i] = el)}>
                  {synced && start !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        seek(Math.max(0, start));
                        setFollow(true);
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "font-display text-3xl leading-snug font-bold transition-colors duration-300 sm:text-4xl",
                        active ? "text-text" : i < activeIndex ? "text-muted/60 hover:text-text-secondary" : "text-muted hover:text-text-secondary",
                      )}
                    >
                      {text}
                    </button>
                  ) : (
                    <p className="font-display text-3xl leading-snug font-bold text-text-secondary sm:text-4xl">{text}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {synced && !follow && activeIndex >= 0 && (
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            centreLine(activeIndex);
          }}
          className="jelly-control absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-text"
        >
          <LocateFixed className="size-4" aria-hidden="true" /> Back to current line
        </button>
      )}
    </aside>
  );
}
