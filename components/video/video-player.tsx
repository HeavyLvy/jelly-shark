"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type Hls from "hls.js";
import type { BaseItemDto, MediaSegmentDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaSegmentApi } from "@jellyfin/sdk/lib/utils/api/media-segment-api";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import {
  ArrowLeft,
  ListOrdered,
  MonitorPlay,
  Check,
  Settings,
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
import { jf, jfUrl } from "@/lib/jellyfin/client";
import { pickImage } from "@/lib/jellyfin/images";
import { audioStreams, chooseTracks, negotiateVideo, streamLabel, subtitleSrc, subtitleStreams, type TrackChoice, type VideoSource } from "@/lib/player/video-negotiate";
import { PLAYBACK_SPEEDS, QUALITY_OPTIONS, SUBTITLE_SIZES, readVideoPrefs, writeVideoPrefs, type SubtitleSize, type SubtitleStyle, type VideoPrefs } from "@/lib/player/video-prefs";
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
  /** Browser's own controls (our overlays, taps and shortcuts step aside). */
  const native = prefs.nativeControls;
  const [choice, setChoice] = useState<TrackChoice>(() => chooseTracks(item, readVideoPrefs()));
  /** The choice the current stream was negotiated with. Text-subtitle switches only change `choice`. */
  const [negotiated, setNegotiated] = useState<TrackChoice>(choice);
  /** Brief on-screen message for keyboard actions (volume, subtitles). */
  const [osd, setOsd] = useState<{ icon: "volume" | "mute" | "subs"; text: string } | null>(null);
  const osdTimer = useRef<number | undefined>(undefined);
  const flashOsd = useCallback((next: { icon: "volume" | "mute" | "subs"; text: string }) => {
    setOsd(next);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 1200);
  }, []);
  /** Last subtitle index turned on in this video (what "c" restores). */
  const lastSubRef = useRef<number | null>(null);
  const toggleSubsRef = useRef<() => void>(() => {});
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
  const [menu, setMenu] = useState<"none" | "tracks" | "settings" | "chapters">("none");
  /** Playback speed (per video, not remembered). */
  const [speed, setSpeed] = useState(1);
  /** Subtitle timing offset in seconds (+ = later). Per video. */
  const [subOffset, setSubOffset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** The <video> itself is fullscreen (touch): show the browser's controls there. */
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dismissedNext, setDismissedNext] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  /** Subtitle track src that has finished loading (Jellyfin may extract it from the file first). */
  const [loadedTrack, setLoadedTrack] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  /** Subtitle still loading after 10s (Jellyfin extracting it from the file). */
  const [slowTrack, setSlowTrack] = useState<string | null>(null);

  const itemId = item.Id ?? "";
  /** Seek-bar thumbnails (Jellyfin trickplay), when the server has generated them. */
  const preview = useMemo(() => trickplayFor(item, source?.mediaSourceId), [item, source?.mediaSourceId]);
  /** Chapters (seconds + name), when the file has more than one. */
  const chapters = useMemo(
    () => (item.Chapters ?? []).filter((c) => typeof c.StartPositionTicks === "number").map((c, i) => ({ start: (c.StartPositionTicks ?? 0) / 10_000_000, name: c.Name || `Chapter ${i + 1}` })),
    [item],
  );
  /** Text subtitles, all attached as <track>s (see the subtitle effect). */
  const textSubs = useMemo(() => subtitleStreams(item).filter((s) => s.IsTextSubtitleStream), [item]);
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
  // Touch screens: fullscreen the <video> itself so the phone's own player UI
  // takes over (and try landscape); desktop: fullscreen our whole player.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (v && window.matchMedia("(pointer: coarse)").matches) {
      if (v.requestFullscreen) {
        void v
          .requestFullscreen({ navigationUI: "hide" })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
          .catch(() => {});
      } else v.webkitEnterFullscreen?.(); // iPhone Safari
      return;
    }
    void containerRef.current?.requestFullscreen();
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

  /* ---------- touch: tap toggles controls, double-tap a side seeks ±10s ---------- */
  const lastPointer = useRef<string>("mouse");
  const tapState = useRef<{ at: number; side: "left" | "right" | "centre"; timer?: number }>({ at: 0, side: "centre" });
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right"; amount: number; key: number } | null>(null);
  const seekFlashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(seekFlashTimer.current), []);
  const onVideoTap = (clientX: number) => {
    const w = containerRef.current?.clientWidth || window.innerWidth;
    const side = clientX < w / 3 ? "left" : clientX > (w * 2) / 3 ? "right" : "centre";
    const t = tapState.current;
    const now = performance.now();
    const isDouble = now - t.at < 300 && side === t.side && side !== "centre";
    window.clearTimeout(t.timer);
    if (isDouble || (seekFlash && seekFlash.side === side && now - t.at < 700)) {
      // Each extra quick tap on the same side adds another 10s.
      const dir = side === "left" ? -1 : 1;
      seekBy(dir * 10);
      setSeekFlash((f) => ({ side: side as "left" | "right", amount: f && f.side === side ? f.amount + 10 : 10, key: now }));
      window.clearTimeout(seekFlashTimer.current);
      seekFlashTimer.current = window.setTimeout(() => setSeekFlash(null), 700);
      tapState.current = { at: now, side };
      return;
    }
    tapState.current = {
      at: now,
      side,
      // Wait briefly so a double-tap doesn't also toggle the controls.
      timer: window.setTimeout(() => {
        if (menu !== "none") setMenu("none");
        else if (controls) setControls(false);
        else poke();
      }, 250),
    };
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (native || e.altKey || e.ctrlKey || e.metaKey) return;
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
        flashOsd({ icon: vol === 0 ? "mute" : "volume", text: `Volume ${Math.round(vol * 100)}%` });
      } else if (k === "c") {
        e.preventDefault();
        toggleSubsRef.current();
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
  }, [togglePlay, seekBy, toggleFullscreen, poke, menu, prefs.volume, flashOsd, native]);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
      setVideoFullscreen(!!document.fullscreenElement && document.fullscreenElement === videoRef.current);
      if (!document.fullscreenElement) (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---------- autoplay countdown after the episode ends ---------- */
  useEffect(() => {
    // Settings → "Autoplay next episode" off: the card stays, without a countdown.
    if (!ended || !next || dismissedNext || !prefs.autoplayNext) return;
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
  }, [ended, next, dismissedNext, goNext, prefs.autoplayNext]);

  /* ---------- track / quality changes ---------- */
  const changeTracks = (patch: Partial<TrackChoice>) => {
    const nextChoice = { ...choice, ...patch };
    if (nextChoice.audioIndex === choice.audioIndex && nextChoice.subtitleIndex === choice.subtitleIndex) return;
    const streams = [...audioStreams(item), ...subtitleStreams(item)];
    if (patch.audioIndex !== undefined) writeVideoPrefs({ audioLang: streams.find((s) => s.Index === patch.audioIndex)?.Language ?? null });
    if (patch.subtitleIndex !== undefined) {
      const lang = patch.subtitleIndex < 0 ? "off" : streams.find((s) => s.Index === patch.subtitleIndex)?.Language ?? "off";
      writeVideoPrefs(lang === "off" ? { subtitleLang: "off" } : { subtitleLang: lang, lastSubtitleLang: lang });
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
          ? { src: subtitleSrc(itemId, source.mediaSourceId, newSub.Index), lang: newSub.Language ?? "und", label: streamLabel(newSub) }
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

  // "c": subtitles off ↔ on. On = the last subtitle used in this video, else the
  // last language used anywhere, else the first subtitle in the list. Text
  // subtitles win over picture ones (PGS/DVD), which force a burn-in re-encode.
  const toggleSubtitles = () => {
    const subs = subtitleStreams(item);
    if (subs.length === 0) return flashOsd({ icon: "subs", text: "No subtitles" });
    if (choice.subtitleIndex >= 0) {
      lastSubRef.current = choice.subtitleIndex;
      changeTracks({ subtitleIndex: -1 });
      return flashOsd({ icon: "subs", text: "Subtitles off" });
    }
    const lang = readVideoPrefs().lastSubtitleLang;
    const byLang = lang ? subs.filter((s) => s.Language?.toLowerCase() === lang.toLowerCase()) : [];
    const pick =
      subs.find((s) => s.Index === lastSubRef.current) ??
      byLang.find((s) => s.IsTextSubtitleStream) ??
      subs.find((s) => s.IsTextSubtitleStream) ??
      byLang[0] ??
      subs[0];
    changeTracks({ subtitleIndex: pick.Index ?? -1 });
    flashOsd({ icon: "subs", text: `Subtitles: ${streamLabel(pick)}` });
  };
  useEffect(() => {
    toggleSubsRef.current = toggleSubtitles;
  });

  // Every text subtitle stays attached as a <track>; switching only changes
  // which one is "showing". Removing/re-adding <track>s while a cue is on
  // screen can leave a stale caption frozen in some browsers. Disabled tracks
  // aren't downloaded, so this costs nothing.
  // React doesn't wire onLoad/onError for <track>, so listen natively. A cached
  // track can finish before we attach, hence the readyState check.
  const trackSrc = source?.textTrack?.src;
  const msId = source?.mediaSourceId;
  useEffect(() => {
    const tracks = Array.from(videoRef.current?.querySelectorAll("track") ?? []);
    const want = trackSrc ? new URL(trackSrc, window.location.origin).href : null;
    for (const t of tracks) t.track.mode = t.src === want ? "showing" : "disabled";
    const el = tracks.find((t) => t.src === want);
    if (!el || !trackSrc) return;
    const loaded = () => {
      if (el.track.mode !== "showing") return;
      setLoadedTrack(el.src);
    };
    const failed = () => setTrackError(el.src);
    if (el.readyState === HTMLTrackElement.LOADED) loaded();
    else if (el.readyState === HTMLTrackElement.ERROR) failed();
    el.addEventListener("load", loaded);
    el.addEventListener("error", failed);
    const slow = window.setTimeout(() => setSlowTrack(el.src), 10_000);
    return () => {
      window.clearTimeout(slow);
      el.removeEventListener("load", loaded);
      el.removeEventListener("error", failed);
    };
  }, [trackSrc, msId]);

  // Speed survives source changes (a new src resets playbackRate).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.defaultPlaybackRate = speed;
    v.playbackRate = speed;
  }, [speed, source]);

  // Subtitle timing: shift every cue of the showing track by the offset (originals kept per cue).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (const t of Array.from(v.textTracks)) if (t.mode === "showing") shiftCues(t, subOffset);
  }, [subOffset, trackSrc, loadedTrack]);

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
      data-sub-size={prefs.subtitleSize}
      data-sub-style={prefs.subtitleStyle}
      onPointerMove={(e) => e.pointerType !== "touch" && poke()}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
        // Touches on the video are handled by onVideoTap (tap toggles controls).
        if (e.pointerType !== "touch" || e.target !== videoRef.current) poke();
      }}
      className={cn("fixed inset-0 overflow-hidden bg-black select-none", !controlsShown && "cursor-none")}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full bg-black object-contain"
        playsInline
        controls={native || videoFullscreen}
        onClick={(e) => {
          if (native) return;
          if (lastPointer.current === "touch") return onVideoTap(e.clientX);
          if (menu !== "none") setMenu("none");
          else togglePlay();
        }}
        onDoubleClick={() => !native && lastPointer.current !== "touch" && toggleFullscreen()}
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
        {source &&
          textSubs.map((s) => (
            <track key={`${source.mediaSourceId}-${s.Index}`} kind="subtitles" src={subtitleSrc(itemId, source.mediaSourceId, s.Index)} srcLang={s.Language ?? "und"} label={streamLabel(s)} />
          ))}
      </video>

      {/* Buffering / tap-to-play */}
      {buffering && !error && !needsTap && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className="size-12 border-4" label="Buffering" />
        </div>
      )}
      {needsTap && !error && !native && (
        <button type="button" onClick={togglePlay} aria-label="Play" className="jelly-control jelly-backdrop absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-text">
          <Play className="size-9 translate-x-0.5 fill-current" aria-hidden="true" />
        </button>
      )}

      {/* Touch: big centre controls while the controls are showing (YouTube-style). */}
      {!native && !needsTap && !error && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 hidden items-center justify-center gap-10 transition-opacity duration-300 pointer-coarse:flex",
            controlsShown ? "opacity-100" : "opacity-0",
          )}
        >
          <CentreButton label="Back 10 seconds" shown={controlsShown} className="size-14" onClick={() => { seekBy(-10); poke(); }}>
            <RotateCcw className="size-6" aria-hidden="true" />
          </CentreButton>
          <CentreButton label={playing ? "Pause" : "Play"} shown={controlsShown} className="size-[4.5rem]" onClick={() => { togglePlay(); poke(); }}>
            {playing ? <Pause className="size-8 fill-current" aria-hidden="true" /> : <Play className="size-8 translate-x-0.5 fill-current" aria-hidden="true" />}
          </CentreButton>
          <CentreButton label="Forward 10 seconds" shown={controlsShown} className="size-14" onClick={() => { seekBy(10); poke(); }}>
            <RotateCw className="size-6" aria-hidden="true" />
          </CentreButton>
        </div>
      )}

      {/* Double-tap seek feedback */}
      {seekFlash && (
        <div
          key={seekFlash.key}
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-y-0 flex w-1/3 items-center justify-center", seekFlash.side === "left" ? "left-0" : "right-0")}
        >
          <span className="jelly-panel flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold">
            {seekFlash.side === "left" ? <RotateCcw className="size-4" aria-hidden="true" /> : <RotateCw className="size-4" aria-hidden="true" />}
            {seekFlash.side === "left" ? "−" : "+"}
            {seekFlash.amount}s
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
          <ErrorState title="Playback error" description={error} action={<Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>} />
          <BackLink onClick={back} />
        </div>
      )}

      {/* Top bar. With native controls: just Back and the controls switch, always shown. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex items-center gap-4 px-4 pt-4 transition-opacity duration-300 sm:px-8",
          native ? "pointer-events-none [&>*]:pointer-events-auto" : "bg-linear-to-b from-black/80 to-black/0 pb-10",
          native || controlsShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button type="button" onClick={back} aria-label="Back" className="jelly-control jelly-backdrop flex size-11 shrink-0 items-center justify-center rounded-full text-text">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className={cn("min-w-0 flex-1", native && "invisible")}>
          <h1 className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-text-secondary">{subtitle}</p>}
        </div>
        {/* Native controls hide our bottom bar, so Settings lives up here then. */}
        {native && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === "settings" ? "none" : "settings")}
              aria-label="Settings"
              aria-expanded={menu === "settings"}
              className="jelly-control jelly-backdrop flex size-11 shrink-0 items-center justify-center rounded-full text-text"
            >
              <Settings className="size-5" aria-hidden="true" />
            </button>
            {menu === "settings" && (
              <SettingsMenu
                place={"top-full mt-3"}
                maxBitrate={maxBitrate}
                onQuality={changeQuality}
                native={native}
                speed={speed}
                onSpeed={setSpeed}
                subSize={prefs.subtitleSize}
                onSubSize={(v) => updatePrefs({ subtitleSize: v })}
                subStyle={prefs.subtitleStyle}
                onSubStyle={(v) => updatePrefs({ subtitleStyle: v })}
                subOffset={subOffset}
                onSubOffset={setSubOffset}
                hasTextSubs={!!source?.textTrack}
                onToggleNative={() => {
                  updatePrefs({ nativeControls: !native });
                  setMenu("none");
                }}
              />
            )}
          </div>
        )}
      </div>
      {native && menu === "settings" && <button type="button" aria-label="Close settings" tabIndex={-1} onClick={() => setMenu("none")} className="fixed inset-0 z-0 cursor-default" />}

      {/* Keyboard feedback (↑ / ↓ volume, c subtitles) */}
      {osd && (
        <div className="jelly-panel pointer-events-none absolute top-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums" role="status">
          {osd.icon === "mute" ? <VolumeX className="size-4" aria-hidden="true" /> : osd.icon === "volume" ? <Volume2 className="size-4" aria-hidden="true" /> : <Subtitles className="size-4" aria-hidden="true" />} {osd.text}
        </div>
      )}

      {/* Subtitle loading (first request makes Jellyfin extract the track from the file) */}
      {source?.textTrack && loadedTrack !== new URL(source.textTrack.src, window.location.origin).href && (
        <div className="jelly-panel absolute bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-sm" role="status">
          {trackError === new URL(source.textTrack.src, window.location.origin).href ? (
            "Couldn't load subtitles"
          ) : (
            <>
              <Spinner className="size-4" label="Loading subtitles" />
              {slowTrack === new URL(source.textTrack.src, window.location.origin).href
                ? "Jellyfin is extracting these subtitles from the file. The first time can take a few minutes."
                : "Loading subtitles…"}
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
          className="jelly-control jelly-backdrop absolute right-6 bottom-32 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-text sm:right-10"
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
        hidden={native}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-black/0 px-4 pt-16 pb-4 transition-opacity duration-300 sm:px-8 sm:pb-6",
          controlsShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SeekBar time={time} duration={duration} pct={pct} bufPct={bufPct} onSeek={seekTo} preview={preview} chapters={chapters} />
        <div className="mt-2 flex items-center gap-1 sm:gap-2">
          {/* On touch screens these live in the centre cluster instead. */}
          <CtrlButton label={playing ? "Pause (space)" : "Play (space)"} onClick={togglePlay} className="pointer-coarse:hidden">
            {playing ? <Pause className="size-6 fill-current" aria-hidden="true" /> : <Play className="size-6 fill-current" aria-hidden="true" />}
          </CtrlButton>
          <CtrlButton label="Back 10 seconds (←)" onClick={() => seekBy(-10)} className="pointer-coarse:hidden">
            <RotateCcw className="size-5" aria-hidden="true" />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds (→)" onClick={() => seekBy(10)} className="pointer-coarse:hidden">
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
              onKeyDown={(e) => {
                // step="any" would make arrows jump by 1 (0 ↔ 100%); step 5% like ↑/↓ elsewhere.
                const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
                if (!dir) return;
                e.preventDefault();
                const cur = prefs.muted ? 0 : prefs.volume;
                updatePrefs({ volume: Math.round(Math.min(1, Math.max(0, cur + dir * 0.05)) * 100) / 100, muted: false });
              }}
              style={{ "--pct": `${(prefs.muted ? 0 : prefs.volume) * 100}%` } as CSSProperties}
              className="jelly-range hidden h-4 w-24 cursor-pointer appearance-none bg-transparent sm:block"
            />
          </div>
          <span className="ml-1 text-xs whitespace-nowrap text-text-secondary tabular-nums sm:ml-2 sm:text-sm">
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
          {chapters.length > 1 && (
            <div className="relative">
              <CtrlButton label="Chapters" active={menu === "chapters"} onClick={() => setMenu(menu === "chapters" ? "none" : "chapters")}>
                <ListOrdered className="size-5" aria-hidden="true" />
              </CtrlButton>
              {menu === "chapters" && (
                <ChaptersMenu
                  chapters={chapters}
                  time={time}
                  onPick={(t) => {
                    seekTo(t);
                    setMenu("none");
                  }}
                />
              )}
            </div>
          )}
          <div className="relative">
            <CtrlButton label="Settings" active={menu === "settings"} onClick={() => setMenu(menu === "settings" ? "none" : "settings")}>
              <Settings className="size-5" aria-hidden="true" />
            </CtrlButton>
            {menu === "settings" && (
              <SettingsMenu
                place={"bottom-full mb-3"}
                maxBitrate={maxBitrate}
                onQuality={changeQuality}
                native={native}
                speed={speed}
                onSpeed={setSpeed}
                subSize={prefs.subtitleSize}
                onSubSize={(v) => updatePrefs({ subtitleSize: v })}
                subStyle={prefs.subtitleStyle}
                onSubStyle={(v) => updatePrefs({ subtitleStyle: v })}
                subOffset={subOffset}
                onSubOffset={setSubOffset}
                hasTextSubs={!!source?.textTrack}
                onToggleNative={() => {
                  updatePrefs({ nativeControls: !native });
                  setMenu("none");
                }}
              />
            )}
          </div>
          {typeof document !== "undefined" && document.pictureInPictureEnabled && (
            <CtrlButton label="Picture in picture" onClick={() => void togglePip()} className="hidden sm:inline-flex">
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

/** The chapter playing at `t`. */
function chapterAt(chapters: { start: number; name: string }[], t: number) {
  let found = chapters[0];
  for (const c of chapters) if (c.start <= t) found = c;
  return found;
}

/** Shift a text track's cues by `offset` seconds, from their original times (remembered per cue). */
const cueOriginals = new WeakMap<TextTrackCue, { start: number; end: number }>();
function shiftCues(track: TextTrack, offset: number) {
  for (const cue of Array.from(track.cues ?? [])) {
    let o = cueOriginals.get(cue);
    if (!o) {
      o = { start: cue.startTime, end: cue.endTime };
      cueOriginals.set(cue, o);
    }
    cue.startTime = Math.max(0, o.start + offset);
    cue.endTime = Math.max(0, o.end + offset);
  }
}

function ChaptersMenu({ chapters, time, onPick }: { chapters: { start: number; name: string }[]; time: number; onPick: (t: number) => void }) {
  const current = chapterAt(chapters, time);
  return (
    <div role="menu" aria-label="Chapters" className="jelly-panel absolute right-0 bottom-full mb-3 max-h-[min(60vh,28rem)] w-72 overflow-y-auto rounded-panel p-1.5">
      <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Chapters</p>
      {chapters.map((c) => (
        <button key={c.start} type="button" role="menuitemradio" aria-checked={c === current} onClick={() => onPick(c.start)} className={menuRow}>
          <span className={cn("flex-1 truncate", c === current && "font-semibold text-accent")}>{c.name}</span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{formatClock(c.start)}</span>
        </button>
      ))}
    </div>
  );
}

/** ⚙ menu: quality, and the native-controls switch. `place` positions it above/below its button. */
function SettingsMenu({
  place,
  maxBitrate,
  onQuality,
  native,
  onToggleNative,
  speed,
  onSpeed,
  subSize,
  onSubSize,
  subStyle,
  onSubStyle,
  subOffset,
  onSubOffset,
  hasTextSubs,
}: {
  place: string;
  maxBitrate: number | null;
  onQuality: (value: number | null) => void;
  native: boolean;
  onToggleNative: () => void;
  speed: number;
  onSpeed: (v: number) => void;
  subSize: SubtitleSize;
  onSubSize: (v: SubtitleSize) => void;
  subStyle: SubtitleStyle;
  onSubStyle: (v: SubtitleStyle) => void;
  subOffset: number;
  onSubOffset: (v: number) => void;
  hasTextSubs: boolean;
}) {
  const seg = (active: boolean) => cn("h-8 flex-1 rounded-full text-xs font-semibold transition", active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text");
  const label = "px-3 pt-2 pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase";
  return (
    <div role="menu" aria-label="Settings" className={cn("jelly-panel absolute right-0 z-10 max-h-[min(72vh,36rem)] w-72 overflow-y-auto rounded-panel p-1.5", place)}>
      <p className={label}>Speed</p>
      <div role="group" aria-label="Playback speed" className="flex gap-1 px-2 pb-1">
        {PLAYBACK_SPEEDS.map((v) => (
          <button key={v} type="button" aria-pressed={speed === v} onClick={() => onSpeed(v)} className={seg(speed === v)}>
            {v === 1 ? "1×" : `${v}`}
          </button>
        ))}
      </div>
      <div role="separator" className="my-1 h-px bg-hairline" />
      <p className={label}>Subtitles</p>
      <div className="space-y-2 px-2 pb-1">
        <div role="group" aria-label="Subtitle size" className="flex items-center gap-1">
          <span className="w-20 shrink-0 text-xs text-text-secondary">Size</span>
          {SUBTITLE_SIZES.map((sz) => (
            <button key={sz.value} type="button" aria-pressed={subSize === sz.value} aria-label={`Subtitle size ${sz.value}`} onClick={() => onSubSize(sz.value)} className={seg(subSize === sz.value)}>
              {sz.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Subtitle background" className="flex items-center gap-1">
          <span className="w-20 shrink-0 text-xs text-text-secondary">Background</span>
          <button type="button" aria-pressed={subStyle === "box"} onClick={() => onSubStyle("box")} className={seg(subStyle === "box")}>
            Box
          </button>
          <button type="button" aria-pressed={subStyle === "shadow"} onClick={() => onSubStyle("shadow")} className={seg(subStyle === "shadow")}>
            Shadow
          </button>
        </div>
        <div role="group" aria-label="Subtitle timing" className={cn("flex items-center gap-1", !hasTextSubs && "opacity-50")}>
          <span className="w-20 shrink-0 text-xs text-text-secondary">Timing</span>
          <button type="button" disabled={!hasTextSubs} aria-label="Subtitles earlier by half a second" onClick={() => onSubOffset(Math.round((subOffset - 0.5) * 10) / 10)} className={seg(false)}>
            −0.5s
          </button>
          <button type="button" disabled={!hasTextSubs || subOffset === 0} onClick={() => onSubOffset(0)} className={cn(seg(false), "tabular-nums")} aria-label="Reset subtitle timing">
            {subOffset > 0 ? "+" : ""}
            {subOffset.toFixed(1)}s
          </button>
          <button type="button" disabled={!hasTextSubs} aria-label="Subtitles later by half a second" onClick={() => onSubOffset(Math.round((subOffset + 0.5) * 10) / 10)} className={seg(false)}>
            +0.5s
          </button>
        </div>
      </div>
      <div role="separator" className="my-1 h-px bg-hairline" />
      <p className={label}>Quality</p>
      {QUALITY_OPTIONS.map((q) => (
        <button key={q.label} type="button" role="menuitemradio" aria-checked={maxBitrate === q.value} onClick={() => onQuality(q.value)} className={menuRow}>
          <span className="flex-1">{q.label}</span>
          {maxBitrate === q.value && <Check className="size-4 text-accent" aria-hidden="true" />}
        </button>
      ))}
      <div role="separator" className="my-1 h-px bg-hairline" />
      <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Player</p>
      <button type="button" role="menuitemcheckbox" aria-checked={native} onClick={onToggleNative} className={menuRow}>
        <MonitorPlay className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="flex-1">
          Native player controls
          <span className="block text-xs text-muted">Use your device&apos;s own video controls</span>
        </span>
        <span aria-hidden="true" className={cn("relative h-5 w-9 shrink-0 rounded-full transition", native ? "bg-accent" : "bg-overlay-strong")}>
          <span className={cn("absolute top-0.5 size-4 rounded-full bg-text transition-all", native ? "left-[1.125rem]" : "left-0.5")} />
        </span>
      </button>
    </div>
  );
}

/** Big round control in the touch centre cluster. */
function CentreButton({ label, onClick, shown, className, children }: { label: string; onClick: () => void; shown: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      tabIndex={shown ? 0 : -1}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("jelly-control jelly-backdrop flex items-center justify-center rounded-full text-text active:scale-95", shown && "pointer-events-auto", className)}
    >
      {children}
    </button>
  );
}

function CtrlButton({ label, onClick, active, className, children }: { label: string; onClick: () => void; active?: boolean; className?: string; children: React.ReactNode }) {
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
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition hover:bg-overlay-strong", active && "bg-overlay-strong text-accent", className)}
    >
      {children}
    </button>
  );
}

interface TrickplayPreview {
  /** Tile image URL for a tile index. */
  tileUrl: (tile: number) => string;
  /** One thumbnail's size in px, grid size, count and spacing (ms). */
  width: number;
  height: number;
  cols: number;
  rows: number;
  count: number;
  interval: number;
}

/** Display width of the hover thumbnail. */
const PREVIEW_WIDTH = 240;

/**
 * Jellyfin trickplay: per media source, per thumbnail width, a set of tile
 * images (`/Videos/{id}/Trickplay/{width}/{tile}.jpg`), each a cols×rows grid
 * of thumbnails taken every `Interval` ms. Picks the smallest width ≥ 240px.
 */
function trickplayFor(item: BaseItemDto, mediaSourceId: string | undefined): TrickplayPreview | null {
  const all = item.Trickplay;
  if (!all || !item.Id) return null;
  const byWidth = (mediaSourceId && all[mediaSourceId]) || Object.values(all)[0];
  if (!byWidth) return null;
  const widths = Object.keys(byWidth).map(Number).filter(Boolean).sort((a, b) => a - b);
  const w = widths.find((x) => x >= PREVIEW_WIDTH) ?? widths.at(-1);
  const info = w ? byWidth[String(w)] : undefined;
  if (!w || !info?.Width || !info.Height || !info.TileWidth || !info.TileHeight || !info.ThumbnailCount || !info.Interval) return null;
  const id = item.Id;
  const msid = mediaSourceId ?? Object.keys(all)[0];
  return {
    tileUrl: (tile) => jfUrl(`/Videos/${id}/Trickplay/${w}/${tile}.jpg`, { mediaSourceId: msid }),
    width: info.Width,
    height: info.Height,
    cols: info.TileWidth,
    rows: info.TileHeight,
    count: info.ThumbnailCount,
    interval: info.Interval,
  };
}

/** The thumbnail for a time, cut out of its tile with background-position. */
function PreviewThumb({ preview, seconds }: { preview: TrickplayPreview; seconds: number }) {
  const n = Math.min(preview.count - 1, Math.max(0, Math.floor((seconds * 1000) / preview.interval)));
  const perTile = preview.cols * preview.rows;
  const tile = Math.floor(n / perTile);
  const local = n % perTile;
  const scale = PREVIEW_WIDTH / preview.width;
  const w = PREVIEW_WIDTH;
  const h = Math.round(preview.height * scale);
  return (
    <span
      className="block rounded-[10px] bg-black bg-no-repeat ring-1 ring-white/20"
      style={{
        width: w,
        height: h,
        backgroundImage: `url("${preview.tileUrl(tile)}")`,
        backgroundSize: `${preview.cols * w}px ${preview.rows * h}px`,
        backgroundPosition: `${-(local % preview.cols) * w}px ${-Math.floor(local / preview.cols) * h}px`,
      }}
    />
  );
}

function SeekBar({
  time,
  duration,
  pct,
  bufPct,
  onSeek,
  preview,
  chapters,
}: {
  time: number;
  duration: number;
  pct: number;
  bufPct: number;
  onSeek: (t: number) => void;
  preview: TrickplayPreview | null;
  chapters: { start: number; name: string }[];
}) {
  const [hover, setHover] = useState<{ frac: number; barWidth: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  // While dragging, preview the drag position; otherwise the hovered one.
  const frac = drag !== null && duration > 0 ? drag / duration : hover?.frac ?? null;
  const barWidth = hover?.barWidth ?? 0;
  // Keep the bubble inside the bar's ends.
  const half = (preview ? PREVIEW_WIDTH : 48) / 2;
  const left = frac !== null && barWidth ? Math.min(barWidth - half, Math.max(half, frac * barWidth)) : null;
  return (
    <div
      className="relative flex items-center"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover({ frac: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), barWidth: r.width });
      }}
      onPointerLeave={() => setHover(null)}
    >
      {frac !== null && left !== null && duration > 0 && (
        <span aria-hidden="true" className="pointer-events-none absolute bottom-full mb-3 flex -translate-x-1/2 flex-col items-center gap-1.5" style={{ left }}>
          {preview && <PreviewThumb preview={preview} seconds={frac * duration} />}
          <span className="jelly-panel max-w-60 truncate rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
            {formatClock(frac * duration)}
            {chapters.length > 1 && <span className="font-normal text-text-secondary"> · {chapterAt(chapters, frac * duration)?.name}</span>}
          </span>
        </span>
      )}
      {/* Chapter ticks */}
      {duration > 0 &&
        chapters.length > 1 &&
        chapters.slice(1).map((c) => (
          <span key={c.start} aria-hidden="true" className="pointer-events-none absolute top-1/2 z-10 h-[7px] w-0.5 -translate-y-1/2 bg-black/70" style={{ left: `${(c.start / duration) * 100}%` }} />
        ))}
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
        onKeyDown={(e) => {
          // step="any" would step 1s; match the ←/→ shortcut (10s).
          const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
          if (!dir) return;
          e.preventDefault();
          onSeek(Math.min(Math.max(0, time + dir * 10), duration || 0));
        }}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow")) return;
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
