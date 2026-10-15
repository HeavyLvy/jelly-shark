"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type Hls from "hls.js";
import type { BaseItemDto, MediaSegmentDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaSegmentApi } from "@jellyfin/sdk/lib/utils/api/media-segment-api";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import {
  ArrowLeft,
  Check,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ErrorState, Spinner } from "@/components/ui/states";
import { TICKS_PER_SECOND, episodeCode, formatClock } from "@/lib/format";
import { jf } from "@/lib/jellyfin/client";
import { pickImage } from "@/lib/jellyfin/images";
import { audioStreams, chooseTracks, negotiateVideo, streamLabel, subtitleStreams, type TrackChoice, type VideoSource } from "@/lib/player/video-negotiate";
import { QUALITY_OPTIONS, readVideoPrefs, writeVideoPrefs, type VideoPrefs } from "@/lib/player/video-prefs";
import { usePlayer } from "@/lib/player/store";
import { useItem } from "@/lib/queries/items";
import { useJfQuery } from "@/lib/queries/use-jf-query";
import { detailHref } from "@/lib/routes";

const PROGRESS_MS = 10_000;
const HIDE_CONTROLS_MS = 3000;
const NEXT_UP_LEAD_S = 25;
const AUTOPLAY_COUNTDOWN_S = 10;
const SKIPPABLE = new Set(["Intro", "Recap", "Preview", "Commercial"]);
const SKIP_LABEL: Record<string, string> = { Intro: "Skip intro", Recap: "Skip recap", Preview: "Skip preview", Commercial: "Skip ad" };

const ticks = (s: number) => Math.max(0, Math.round(s * TICKS_PER_SECOND));
const gain = (v: number) => Math.min(1, Math.max(0, v)) ** 3; // same curve as jellyfin-web / the music player

/** Full-screen video player for /watch/[id]. */
export function VideoPlayer({ id }: { id: string }) {
  const router = useRouter();
  const item = useItem(id);
  const data = item.data;

  if (item.isError) {
    return (
      <Shell>
        <ErrorState as="h1" title="Couldn't load this video" action={<Button onClick={() => void item.refetch()}>Retry</Button>} />
        <BackLink onClick={() => router.back()} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <Spinner className="size-10" label="Loading video" />
      </Shell>
    );
  }
  return <Player item={data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black">{children}</div>;
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-text-secondary hover:bg-overlay hover:text-text">
      <ArrowLeft className="size-4" aria-hidden="true" /> Back
    </button>
  );
}

function Player({ item }: { item: BaseItemDto }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  /** Playback position (s) kept across renegotiations and Activity hide/show. */
  const positionRef = useRef<number | null>(null);
  const reportedRef = useRef<{ source: VideoSource; started: boolean } | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const [prefs, setPrefs] = useState<VideoPrefs>(() => readVideoPrefs());
  const [choice, setChoice] = useState<TrackChoice>(() => chooseTracks(item, readVideoPrefs()));
  /** The choice the current stream was negotiated with. Text-subtitle switches only change `choice`. */
  const [negotiated, setNegotiated] = useState<TrackChoice>(choice);
  const [volumeToast, setVolumeToast] = useState<number | null>(null);
  const volumeToastTimer = useRef<number | undefined>(undefined);
  const [maxBitrate, setMaxBitrate] = useState<number | null>(() => readVideoPrefs().maxBitrate);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.RunTimeTicks ? item.RunTimeTicks / TICKS_PER_SECOND : 0);
  const [buffered, setBuffered] = useState(0);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<"none" | "tracks" | "quality">("none");
  const [fullscreen, setFullscreen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dismissedNext, setDismissedNext] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  /** Subtitle track src that has finished loading (Jellyfin may extract it from the file first). */
  const [loadedTrack, setLoadedTrack] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  const itemId = item.Id ?? "";
  const isEpisode = item.Type === "Episode";
  const title = isEpisode ? item.SeriesName ?? item.Name : item.Name;
  const subtitle = isEpisode ? [episodeCode(item), item.Name].filter(Boolean).join(" · ") : item.ProductionYear ? String(item.ProductionYear) : "";

  /* ---------- side data: next episode + media segments ---------- */
  const nextEp = useJfQuery({
    queryKey: ["jf", "next-episode", itemId],
    enabled: isEpisode && !!item.SeriesId,
    queryFn: async ({ signal }) => {
      const { data } = await getShowApi(jf).getEpisodes({ seriesId: item.SeriesId ?? "", startItemId: itemId, limit: 2, fields: ["Overview"] }, { signal });
      return (data.Items ?? []).find((e) => e.Id !== itemId) ?? null;
    },
  });
  const segments = useJfQuery({
    queryKey: ["jf", "segments", itemId],
    staleTime: Infinity,
    queryFn: async ({ signal }) => (await getMediaSegmentApi(jf).getItemSegments({ itemId }, { signal })).data.Items ?? [],
  });
  const next = nextEp.data ?? null;

  /* ---------- reporting ---------- */
  const report = useCallback(
    (kind: "start" | "progress" | "stop") => {
      const v = videoRef.current;
      const r = reportedRef.current;
      if (!r) return;
      const base = {
        ItemId: itemId,
        MediaSourceId: r.source.mediaSourceId,
        PlaySessionId: r.source.playSessionId,
        PositionTicks: ticks(v?.currentTime ?? positionRef.current ?? 0),
      };
      const api = getSessionApi(jf);
      const extra = {
        PlayMethod: r.source.playMethod,
        AudioStreamIndex: r.source.audioIndex ?? undefined,
        SubtitleStreamIndex: r.source.subtitleIndex,
        IsPaused: v?.paused ?? true,
        IsMuted: v?.muted ?? false,
        CanSeek: true,
      };
      if (kind === "start") void api.reportPlaybackStart({ playbackStartInfo: { ...base, ...extra } }).catch(() => {});
      else if (kind === "progress") void api.reportPlaybackProgress({ playbackProgressInfo: { ...base, ...extra } }).catch(() => {});
      else {
        reportedRef.current = null;
        void api.reportPlaybackStopped({ playbackStopInfo: base }).catch(() => {});
      }
    },
    [itemId],
  );

  /* ---------- negotiate + attach (re-runs on track / quality change, retry, Activity re-show) ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const ctrl = new AbortController();
    let cancelled = false;

    // First run: honour the resume point (unless ?t=0).
    if (positionRef.current === null) {
      const fromStart = new URLSearchParams(window.location.search).get("t") === "0";
      const resume = (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;
      const runtime = (item.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
      const useResume = !fromStart && resume > 10 && (!runtime || resume < runtime * 0.95);
      positionRef.current = useResume ? resume : 0;
      if (useResume) window.setTimeout(() => !cancelled && setResumedFrom(resume), 0);
    }
    const start = positionRef.current ?? 0;

    void (async () => {
      try {
        setError(null);
        setBuffering(true);
        const src = await negotiateVideo(item, negotiated, maxBitrate, ctrl.signal);
        if (cancelled) return;
        setSource(src);
        reportedRef.current = { source: src, started: false };

        if (src.isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
          const { default: HlsCtor } = await import("hls.js");
          if (cancelled) return;
          if (!HlsCtor.isSupported()) throw new Error("This browser can't play HLS streams.");
          const hls = new HlsCtor({ startPosition: start, maxBufferLength: 30, backBufferLength: 60 });
          hlsRef.current = hls;
          let recovered = false;
          hls.on(HlsCtor.Events.ERROR, (_e, d) => {
            if (!d.fatal) return;
            if (d.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !recovered) {
              recovered = true;
              hls.recoverMediaError();
              return;
            }
            if (d.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !recovered) {
              recovered = true;
              hls.startLoad();
              return;
            }
            setError("Playback failed. The stream couldn't be loaded.");
          });
          hls.loadSource(src.url);
          hls.attachMedia(video);
        } else {
          video.src = src.url;
          const seekToStart = () => {
            if (start > 0) video.currentTime = start;
          };
          video.addEventListener("loadedmetadata", seekToStart, { once: true });
        }
        const p = video.play();
        p?.catch((err: unknown) => {
          if (!cancelled && err instanceof DOMException && err.name === "NotAllowedError") setNeedsTap(true);
        });
      } catch (err) {
        if (cancelled || ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't start playback.");
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      positionRef.current = video.currentTime > 0 ? video.currentTime : positionRef.current;
      // Stop reporting kills the server-side transcode for this PlaySessionId.
      report("stop");
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [item, negotiated, maxBitrate, attempt, report]);

  /* ---------- progress reporting, page close ---------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) report("progress");
    }, PROGRESS_MS);
    const onHide = () => {
      const r = reportedRef.current;
      const v = videoRef.current;
      if (!r) return;
      void fetch("/api/jf/Sessions/Playing/Stopped", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ItemId: itemId, MediaSourceId: r.source.mediaSourceId, PlaySessionId: r.source.playSessionId, PositionTicks: ticks(v?.currentTime ?? 0) }),
      }).catch(() => {});
      reportedRef.current = null;
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onHide);
    };
  }, [report, itemId]);

  /* ---------- volume ---------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = gain(prefs.volume);
    v.muted = prefs.muted;
  }, [prefs.volume, prefs.muted]);

  const updatePrefs = (patch: Partial<VideoPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    writeVideoPrefs(patch);
  };

  /* ---------- transport ---------- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    else v.pause();
  }, []);
  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, t), (v.duration || duration) - 0.5);
  }, [duration]);
  const seekBy = useCallback((d: number) => seekTo((videoRef.current?.currentTime ?? 0) + d), [seekTo]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  }, []);
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* not allowed / unsupported */
    }
  };
  const goNext = useCallback(() => {
    if (next?.Id) router.replace(`/watch/${next.Id}`);
  }, [next, router]);

  /* ---------- auto-hiding controls ---------- */
  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControls(false);
    }, HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const controlsShown = controls || !playing || menu !== "none" || !!error;

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if (e.key === "F11") {
        // F11 toggles the player's own full screen (not the browser window's).
        e.preventDefault();
        toggleFullscreen();
      } else if (k === " " || k === "k") {
        if (k === " " && t?.closest("button, a")) return;
        e.preventDefault();
        togglePlay();
      } else if (k === "arrowleft" || k === "j") {
        e.preventDefault();
        seekBy(-10);
      } else if (k === "arrowright" || k === "l") {
        e.preventDefault();
        seekBy(10);
      } else if (k === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (k === "arrowup" || k === "arrowdown") {
        e.preventDefault();
        const cur = videoRef.current?.muted ? 0 : prefs.volume;
        const vol = Math.round(Math.min(1, Math.max(0, cur + (k === "arrowup" ? 0.05 : -0.05))) * 100) / 100;
        updatePrefs({ volume: vol, muted: false });
        setVolumeToast(vol);
        window.clearTimeout(volumeToastTimer.current);
        volumeToastTimer.current = window.setTimeout(() => setVolumeToast(null), 1200);
      } else if (k === "m") {
        e.preventDefault();
        updatePrefs({ muted: !(videoRef.current?.muted ?? false) });
      } else if (k === "escape" && menu !== "none") {
        setMenu("none");
      } else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, poke, menu, prefs.volume]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---------- autoplay countdown after the episode ends ---------- */
  useEffect(() => {
    if (!ended || !next || dismissedNext) return;
    let n = AUTOPLAY_COUNTDOWN_S;
    const tick = window.setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        window.clearInterval(tick);
        goNext();
      }
    }, 1000);
    window.setTimeout(() => setCountdown(AUTOPLAY_COUNTDOWN_S), 0);
    return () => window.clearInterval(tick);
  }, [ended, next, dismissedNext, goNext]);

  /* ---------- track / quality changes ---------- */
  const changeTracks = (patch: Partial<TrackChoice>) => {
    const nextChoice = { ...choice, ...patch };
    if (nextChoice.audioIndex === choice.audioIndex && nextChoice.subtitleIndex === choice.subtitleIndex) return;
    const streams = [...audioStreams(item), ...subtitleStreams(item)];
    if (patch.audioIndex !== undefined) writeVideoPrefs({ audioLang: streams.find((s) => s.Index === patch.audioIndex)?.Language ?? null });
    if (patch.subtitleIndex !== undefined) {
      writeVideoPrefs({ subtitleLang: patch.subtitleIndex < 0 ? "off" : streams.find((s) => s.Index === patch.subtitleIndex)?.Language ?? "off" });
    }
    // Text subtitles switch locally; everything else (audio, image subs) renegotiates at the current position.
    const curSub = subtitleStreams(item).find((s) => s.Index === choice.subtitleIndex);
    const newSub = subtitleStreams(item).find((s) => s.Index === nextChoice.subtitleIndex);
    const localOnly =
      patch.audioIndex === undefined && (!curSub || curSub.IsTextSubtitleStream) && (!newSub || newSub.IsTextSubtitleStream) && source && !source.burnedIn;
    if (localOnly && source) {
      setSource({
        ...source,
        subtitleIndex: nextChoice.subtitleIndex,
        textTrack: newSub
          ? { src: `/api/jf/Videos/${itemId}/${source.mediaSourceId}/Subtitles/${newSub.Index}/0/Stream.vtt`, lang: newSub.Language ?? "und", label: streamLabel(newSub) }
          : null,
      });
      setChoice(nextChoice);
      if (reportedRef.current) reportedRef.current = { ...reportedRef.current, source: { ...reportedRef.current.source, subtitleIndex: nextChoice.subtitleIndex } };
      return;
    }
    positionRef.current = videoRef.current?.currentTime ?? positionRef.current;
    setChoice(nextChoice);
    setNegotiated(nextChoice);
  };

  const changeQuality = (value: number | null) => {
    positionRef.current = videoRef.current?.currentTime ?? positionRef.current;
    setMaxBitrate(value);
    writeVideoPrefs({ maxBitrate: value });
    setMenu("none");
  };

  /* ---------- derived UI ---------- */
  const activeSkip = (segments.data ?? []).find(
    (s: MediaSegmentDto) => SKIPPABLE.has(String(s.Type)) && time >= (s.StartTicks ?? 0) / TICKS_PER_SECOND && time < (s.EndTicks ?? 0) / TICKS_PER_SECOND - 1,
  );
  const outro = (segments.data ?? []).find((s) => s.Type === "Outro");
  const nearEnd = duration > 0 && (outro ? time >= (outro.StartTicks ?? 0) / TICKS_PER_SECOND : duration - time <= NEXT_UP_LEAD_S);
  const showNextUp = !!next && !dismissedNext && (nearEnd || ended);
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const VolIcon = prefs.muted || prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;
  const back = () => (window.history.length > 1 ? router.back() : router.push(detailHref(item)));

  return (
    <div
      ref={containerRef}
      onPointerMove={poke}
      onPointerDown={poke}
      className={cn("fixed inset-0 overflow-hidden bg-black select-none", !controlsShown && "cursor-none")}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full bg-black object-contain"
        playsInline
        onClick={() => {
          if (menu !== "none") setMenu("none");
          else togglePlay();
        }}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          // Starting a video pauses music.
          usePlayer.getState().pause();
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          report("progress");
        }}
        onPlaying={() => {
          setBuffering(false);
          setNeedsTap(false);
          const r = reportedRef.current;
          if (r && !r.started) {
            r.started = true;
            report("start");
          }
        }}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.duration && Number.isFinite(v.duration)) setDuration(v.duration);
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onSeeked={() => report("progress")}
        onEnded={() => {
          setEnded(true);
          setPlaying(false);
          report("progress");
        }}
      >
        {source?.textTrack && (
          <track
            key={source.textTrack.src}
            kind="subtitles"
            src={source.textTrack.src}
            srcLang={source.textTrack.lang}
            label={source.textTrack.label}
            default
            onLoad={(e) => {
              e.currentTarget.track.mode = "showing";
              setLoadedTrack(e.currentTarget.src);
            }}
            onError={(e) => setTrackError(e.currentTarget.src)}
          />
        )}
      </video>

      {/* Buffering / tap-to-play */}
      {buffering && !error && !needsTap && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="size-12 border-4" label="Buffering" />
        </div>
      )}
      {needsTap && !error && (
        <button type="button" onClick={togglePlay} aria-label="Play" className="jelly-control absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-text">
          <Play className="size-9 translate-x-0.5 fill-current" aria-hidden="true" />
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
          <ErrorState title="Playback error" description={error} action={<Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>} />
          <BackLink onClick={back} />
        </div>
      )}

      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex items-center gap-4 bg-linear-to-b from-black/80 to-black/0 px-4 pt-4 pb-10 transition-opacity duration-300 sm:px-8",
          controlsShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button type="button" onClick={back} aria-label="Back" className="jelly-control flex size-11 shrink-0 items-center justify-center rounded-full text-text">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-text-secondary">{subtitle}</p>}
        </div>
      </div>

      {/* Volume change (↑ / ↓) */}
      {volumeToast !== null && (
        <div className="jelly-panel pointer-events-none absolute top-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums" role="status">
          {volumeToast === 0 ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />} Volume {Math.round(volumeToast * 100)}%
        </div>
      )}

      {/* Subtitle loading (first request makes Jellyfin extract the track from the file) */}
      {source?.textTrack && loadedTrack !== new URL(source.textTrack.src, window.location.origin).href && (
        <div className="jelly-panel absolute bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-sm" role="status">
          {trackError === new URL(source.textTrack.src, window.location.origin).href ? (
            "Couldn't load subtitles"
          ) : (
            <>
              <Spinner className="size-4" label="Loading subtitles" /> Loading subtitles…
            </>
          )}
        </div>
      )}

      {/* Resume toast */}
      {resumedFrom !== null && time < resumedFrom + 8 && !error && (
        <div className="jelly-panel absolute top-24 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm">
          Resumed from {formatClock(resumedFrom)}
          <button
            type="button"
            onClick={() => {
              setResumedFrom(null);
              seekTo(0);
            }}
            className="rounded-full bg-overlay-strong px-3 py-1 font-semibold hover:bg-text hover:text-bg"
          >
            Start over
          </button>
        </div>
      )}

      {/* Skip intro / recap */}
      {activeSkip && (
        <button
          type="button"
          onClick={() => seekTo((activeSkip.EndTicks ?? 0) / TICKS_PER_SECOND)}
          className="jelly-control absolute right-6 bottom-32 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-text sm:right-10"
        >
          {SKIP_LABEL[String(activeSkip.Type)] ?? "Skip"} <SkipForward className="size-4" aria-hidden="true" />
        </button>
      )}

      {/* Next episode card + autoplay countdown */}
      {showNextUp && next && (
        <NextUpCard
          next={next}
          countdown={ended ? countdown : null}
          onPlay={goNext}
          onDismiss={() => {
            setDismissedNext(true);
            setCountdown(null);
          }}
        />
      )}

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-black/0 px-4 pt-16 pb-4 transition-opacity duration-300 sm:px-8 sm:pb-6",
          controlsShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SeekBar time={time} duration={duration} pct={pct} bufPct={bufPct} onSeek={seekTo} />
        <div className="mt-2 flex items-center gap-1 sm:gap-2">
          <CtrlButton label={playing ? "Pause (space)" : "Play (space)"} onClick={togglePlay}>
            {playing ? <Pause className="size-6 fill-current" aria-hidden="true" /> : <Play className="size-6 fill-current" aria-hidden="true" />}
          </CtrlButton>
          <CtrlButton label="Back 10 seconds (←)" onClick={() => seekBy(-10)}>
            <RotateCcw className="size-5" aria-hidden="true" />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds (→)" onClick={() => seekBy(10)}>
            <RotateCw className="size-5" aria-hidden="true" />
          </CtrlButton>
          <div className="group flex items-center">
            <CtrlButton label={prefs.muted ? "Unmute (m)" : "Mute (m)"} onClick={() => updatePrefs({ muted: !prefs.muted })}>
              <VolIcon className="size-5" aria-hidden="true" />
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step="any"
              value={prefs.muted ? 0 : prefs.volume}
              aria-label="Volume"
              aria-valuetext={`${Math.round((prefs.muted ? 0 : prefs.volume) * 100)}%`}
              onChange={(e) => updatePrefs({ volume: Number(e.target.value), muted: false })}
              style={{ "--pct": `${(prefs.muted ? 0 : prefs.volume) * 100}%` } as CSSProperties}
              className="jelly-range hidden h-4 w-24 cursor-pointer appearance-none bg-transparent sm:block"
            />
          </div>
          <span className="ml-2 text-sm text-text-secondary tabular-nums">
            {formatClock(time)} <span className="text-muted">/ {formatClock(duration)}</span>
          </span>
          <span className="flex-1" />
          {source && source.playMethod !== "DirectPlay" && (
            <span className="mr-1 hidden rounded-full bg-overlay-strong px-2.5 py-1 text-[11px] font-semibold tracking-wide text-text-secondary uppercase sm:inline" title="Jellyfin is converting this video for your browser">
              {source.playMethod === "DirectStream" ? "Remux" : "Transcode"}
            </span>
          )}
          {next && (
            <CtrlButton label="Next episode" onClick={goNext}>
              <SkipForward className="size-5" aria-hidden="true" />
            </CtrlButton>
          )}
          <div className="relative">
            <CtrlButton label="Audio & subtitles" active={menu === "tracks"} onClick={() => setMenu(menu === "tracks" ? "none" : "tracks")}>
              <Subtitles className="size-5" aria-hidden="true" />
            </CtrlButton>
            {menu === "tracks" && <TracksMenu item={item} choice={choice} onChange={changeTracks} />}
          </div>
          <div className="relative">
            <CtrlButton label="Quality" active={menu === "quality"} onClick={() => setMenu(menu === "quality" ? "none" : "quality")}>
              <Gauge className="size-5" aria-hidden="true" />
            </CtrlButton>
            {menu === "quality" && (
              <div role="menu" aria-label="Quality" className="jelly-panel absolute right-0 bottom-full mb-3 w-56 rounded-panel p-1.5">
                {QUALITY_OPTIONS.map((q) => (
                  <button key={q.label} type="button" role="menuitemradio" aria-checked={maxBitrate === q.value} onClick={() => changeQuality(q.value)} className={menuRow}>
                    <span className="flex-1">{q.label}</span>
                    {maxBitrate === q.value && <Check className="size-4 text-accent" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {typeof document !== "undefined" && document.pictureInPictureEnabled && (
            <CtrlButton label="Picture in picture" onClick={() => void togglePip()}>
              <PictureInPicture2 className="size-5" aria-hidden="true" />
            </CtrlButton>
          )}
          <CtrlButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}

const menuRow =
  "flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-overlay hover:text-text focus-visible:bg-overlay focus-visible:outline-none";

function CtrlButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        onClick();
        // Mouse clicks shouldn't leave focus on the button, or Space would
        // re-press it instead of play/pause. Keyboard activation keeps focus.
        if (e.detail > 0) e.currentTarget.blur();
      }}
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition hover:bg-overlay-strong", active && "bg-overlay-strong text-accent")}
    >
      {children}
    </button>
  );
}

function SeekBar({ time, duration, pct, bufPct, onSeek }: { time: number; duration: number; pct: number; bufPct: number; onSeek: (t: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <div
      className="relative flex items-center"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {hover !== null && duration > 0 && (
        <span aria-hidden="true" className="jelly-panel pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ left: `${hover * 100}%` }}>
          {formatClock(hover * duration)}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step="any"
        value={drag ?? time}
        aria-label="Seek"
        aria-valuetext={`${formatClock(drag ?? time)} of ${formatClock(duration)}`}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={(e) => {
          onSeek(Number((e.target as HTMLInputElement).value));
          setDrag(null);
        }}
        onKeyUp={(e) => {
          onSeek(Number((e.target as HTMLInputElement).value));
          setDrag(null);
        }}
        style={{ "--pct": `${drag !== null && duration ? (drag / duration) * 100 : pct}%`, "--buf": `${bufPct}%`, "--track": "5px" } as CSSProperties}
        className="jelly-range h-5 w-full cursor-pointer appearance-none bg-transparent"
      />
    </div>
  );
}

function TracksMenu({ item, choice, onChange }: { item: BaseItemDto; choice: TrackChoice; onChange: (p: Partial<TrackChoice>) => void }) {
  const audio = audioStreams(item);
  const subs = subtitleStreams(item);
  return (
    <div role="menu" aria-label="Audio and subtitles" className="jelly-panel absolute right-0 bottom-full mb-3 grid max-h-[60vh] w-[min(36rem,calc(100vw-2rem))] grid-cols-2 gap-2 overflow-y-auto rounded-panel p-2">
      <div>
        <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Audio</p>
        {audio.length === 0 && <p className="px-3 py-2 text-sm text-muted">No audio tracks</p>}
        {audio.map((s) => (
          <button key={s.Index} type="button" role="menuitemradio" aria-checked={choice.audioIndex === s.Index} onClick={() => onChange({ audioIndex: s.Index ?? null })} className={menuRow}>
            <span className="flex-1">{streamLabel(s)}</span>
            {choice.audioIndex === s.Index && <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div>
        <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Subtitles</p>
        <button type="button" role="menuitemradio" aria-checked={choice.subtitleIndex < 0} onClick={() => onChange({ subtitleIndex: -1 })} className={menuRow}>
          <span className="flex-1">Off</span>
          {choice.subtitleIndex < 0 && <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />}
        </button>
        {subs.map((s) => (
          <button key={s.Index} type="button" role="menuitemradio" aria-checked={choice.subtitleIndex === s.Index} onClick={() => onChange({ subtitleIndex: s.Index ?? -1 })} className={menuRow}>
            <span className="flex-1">
              {streamLabel(s)}
              {!s.IsTextSubtitleStream && <span className="block text-[11px] text-muted">Image — burned in (transcodes)</span>}
            </span>
            {choice.subtitleIndex === s.Index && <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function NextUpCard({ next, countdown, onPlay, onDismiss }: { next: BaseItemDto; countdown: number | null; onPlay: () => void; onDismiss: () => void }) {
  return (
    <div className="jelly-panel absolute right-6 bottom-32 flex w-[min(24rem,calc(100vw-3rem))] gap-3 rounded-panel p-3 sm:right-10">
      <JfImage image={pickImage(next, "landscape")} alt="" sizes="160px" className="aspect-video w-36 shrink-0 rounded-card bg-surface-raised" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wider text-accent uppercase">{countdown !== null ? `Next episode in ${countdown}s` : "Next episode"}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{[episodeCode(next), next.Name].filter(Boolean).join(" · ")}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onPlay} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110">
            <Play className="size-3.5 fill-current" aria-hidden="true" /> Play now
          </button>
          <button type="button" onClick={onDismiss} className="rounded-full px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-overlay hover:text-text">
            {countdown !== null ? "Cancel" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
