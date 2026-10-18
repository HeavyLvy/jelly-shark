"use client";

import { useEffect, useRef } from "react";
import type { PlayMethod } from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { jf, jfUrl } from "@/lib/jellyfin/client";
import { TICKS_PER_SECOND } from "@/lib/format";
import { negotiateAudio, type AudioSource } from "@/lib/player/negotiate";
import { clearResume, readResume, saveResume } from "@/lib/player/resume-cookie";
import { currentTrack, usePlayer, type QueueItem } from "@/lib/player/store";

/**
 * Headless music engine, mounted once in the root layout so playback
 * survives navigation.
 *
 * One <audio> element does all playback. (An earlier A/B two-element design
 * confused the OS media integration — Chrome's MPRIS/Media Session follows a
 * single player, so KDE lost play/pause after the element swap on "next".)
 * The next track's PlaybackInfo is negotiated ahead of time and its first
 * bytes are warmed, so track changes start almost immediately.
 *
 * Reports playback to Jellyfin (start / every 10s / pause / stop) and drives
 * the Media Session (OS media keys, lock screen) including playbackState.
 *
 * Debugging: `localStorage.setItem("jelly-debug-audio", "1")` logs every
 * media event (with visibility/focus) to the console.
 */

const PROGRESS_INTERVAL_MS = 10_000;
/** How often the resume cookie is refreshed while playing. */
const RESUME_SAVE_MS = 5_000;
const PREFETCH_TTL_MS = 5 * 60_000;

const ticks = (seconds: number) => Math.max(0, Math.round(seconds * TICKS_PER_SECOND));

/**
 * Slider position (0–1) → element gain. Loudness is perceived roughly
 * logarithmically, so a linear slider is far too loud low down. Uses the same
 * cubic curve as jellyfin-web (`mediaElement.volume = (val / 100) ** 3`), so a
 * given slider position sounds the same in both.
 */
const sliderToGain = (v: number) => Math.min(1, Math.max(0, v)) ** 3;

function nextItem(): QueueItem | null {
  const { queue, index, repeat } = usePlayer.getState();
  if (repeat === "one") return null;
  if (index + 1 < queue.length) return queue[index + 1];
  return repeat === "all" && queue.length > 1 ? queue[0] : null;
}

function artistLine(item: QueueItem): string {
  return item.Artists?.join(", ") || item.AlbumArtist || "";
}

function artworkFor(item: QueueItem): MediaImage[] {
  const id = item.ImageTags?.Primary ? item.Id : item.AlbumId;
  const tag = item.ImageTags?.Primary ?? item.AlbumPrimaryImageTag;
  if (!id || !tag) return [];
  const src = (w: number) => new URL(jfUrl(`/Items/${id}/Images/Primary`, { tag, maxWidth: w, quality: 85 }), window.location.origin).href;
  return [96, 256, 512].map((w) => ({ src: src(w), sizes: `${w}x${w}`, type: "image/jpeg" }));
}

function debugEnabled(): boolean {
  try {
    return window.localStorage.getItem("jelly-debug-audio") === "1";
  } catch {
    return false;
  }
}

export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const store = usePlayer;
    const session = getSessionApi(jf);
    const debug = debugEnabled();
    const log = (...args: unknown[]) => {
      if (debug) console.debug(`[audio ${performance.now().toFixed(0)}ms vis=${document.visibilityState} focus=${document.hasFocus()}]`, ...args);
    };

    /** What the element currently holds. */
    const loaded: { uid: string | null; item: QueueItem | null; source: AudioSource | null; token: number } = {
      uid: null,
      item: null,
      source: null,
      token: 0,
    };
    /** Pre-negotiated next track. */
    let prefetch: { uid: string; at: number; promise: Promise<AudioSource> } | null = null;
    let progressTimer: number | undefined;
    /** Set while we pause/reload on purpose, so the pause event isn't treated as the user pausing. */
    let internalPause = false;

    void store.persist.rehydrate();

    const position = () => (loaded.source?.offset ?? 0) + (el.currentTime || 0);

    /* ---------- resume point (cookie, 1 day) ---------- */
    let lastResumeSave = 0;
    const saveResumePoint = () => {
      if (!loaded.uid || !loaded.source) return;
      if (currentTrack(store.getState())?.uid !== loaded.uid) return;
      lastResumeSave = performance.now();
      saveResume({ uid: loaded.uid, t: position() });
    };

    /* ---------- Media Session ---------- */
    const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
    const setPlaybackState = (state: MediaSessionPlaybackState) => {
      if (ms) ms.playbackState = state;
    };
    const updateMetadata = (item: QueueItem | null) => {
      if (!ms) return;
      ms.metadata = item
        ? new MediaMetadata({ title: item.Name ?? "", artist: artistLine(item), album: item.Album ?? "", artwork: artworkFor(item) })
        : null;
      if (!item) setPlaybackState("none");
    };
    const updatePosition = () => {
      if (!ms?.setPositionState) return;
      const duration = loaded.item?.RunTimeTicks ? loaded.item.RunTimeTicks / TICKS_PER_SECOND : el.duration || 0;
      if (!duration || !Number.isFinite(duration)) return;
      try {
        ms.setPositionState({ duration, position: Math.min(position(), duration), playbackRate: 1 });
      } catch {
        /* transient invalid state */
      }
    };

    /* ---------- Jellyfin reporting ---------- */
    let reported: { itemId: string; source: AudioSource } | null = null;

    const info = (itemId: string, source: AudioSource) => ({
      ItemId: itemId,
      MediaSourceId: source.mediaSourceId,
      PlaySessionId: source.playSessionId,
      PlayMethod: source.playMethod as PlayMethod,
      PositionTicks: ticks(position()),
      CanSeek: true,
      IsPaused: el.paused,
      IsMuted: store.getState().muted,
      VolumeLevel: Math.round(store.getState().volume * 100),
    });
    const reportStop = () => {
      window.clearInterval(progressTimer);
      if (!reported) return;
      const { itemId, source } = reported;
      reported = null;
      void session
        .reportPlaybackStopped({ playbackStopInfo: { ItemId: itemId, MediaSourceId: source.mediaSourceId, PlaySessionId: source.playSessionId, PositionTicks: ticks(position()) } })
        .catch(() => {});
    };
    const reportProgress = () => {
      if (!reported) return;
      void session.reportPlaybackProgress({ playbackProgressInfo: info(reported.itemId, reported.source) }).catch(() => {});
    };
    const reportStart = () => {
      if (!loaded.item?.Id || !loaded.source) return;
      if (reported && reported.itemId === loaded.item.Id && reported.source.playSessionId === loaded.source.playSessionId) return;
      reportStop();
      reported = { itemId: loaded.item.Id, source: loaded.source };
      void session.reportPlaybackStart({ playbackStartInfo: info(loaded.item.Id, loaded.source) }).catch(() => {});
      progressTimer = window.setInterval(reportProgress, PROGRESS_INTERVAL_MS);
    };
    const onPageHide = () => {
      saveResumePoint();
      if (!reported) return;
      const { itemId, source } = reported;
      void fetch("/api/jf/Sessions/Playing/Stopped", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ItemId: itemId, MediaSourceId: source.mediaSourceId, PlaySessionId: source.playSessionId, PositionTicks: ticks(position()) }),
      }).catch(() => {});
      reported = null;
    };
    window.addEventListener("pagehide", onPageHide);

    /* ---------- loading ---------- */
    const negotiate = (item: QueueItem, startSeconds: number): Promise<AudioSource> => {
      if (startSeconds === 0 && prefetch && prefetch.uid === item.uid && Date.now() - prefetch.at < PREFETCH_TTL_MS) {
        const p = prefetch.promise;
        prefetch = null;
        return p.catch(() => negotiateAudio(item.Id ?? "", 0));
      }
      return negotiateAudio(item.Id ?? "", startSeconds);
    };

    const load = async (item: QueueItem, startSeconds = 0): Promise<boolean> => {
      if (!item.Id) return false;
      const token = ++loaded.token;
      loaded.uid = item.uid;
      loaded.item = item;
      loaded.source = null;
      try {
        const source = await negotiate(item, startSeconds);
        if (token !== loaded.token) return false;
        loaded.source = source;
        // The resulting pause/emptied events are async; `emptied` clears the flag.
        internalPause = !el.paused;
        el.src = source.url;
        el.load();
        if (startSeconds > 0 && source.canByteSeek) el.currentTime = startSeconds;
        log("loaded", item.Name, source.playMethod);
        return true;
      } catch (err) {
        if (token !== loaded.token) return false;
        loaded.uid = null;
        store.getState()._report({ error: err instanceof Error ? err.message : "Couldn't play this track.", buffering: false });
        return false;
      }
    };

    const unload = () => {
      loaded.token += 1;
      internalPause = !el.paused;
      el.pause();
      el.removeAttribute("src");
      el.load();
      loaded.uid = null;
      loaded.item = null;
      loaded.source = null;
    };

    const play = () => {
      log("play()");
      el.play()?.catch((err: unknown) => {
        log("play() rejected", err);
        if (err instanceof DOMException && err.name === "NotAllowedError") store.getState()._report({ playing: false });
      });
    };

    /** Negotiate the next track early and warm its first bytes (server + disk cache). */
    const prefetchNext = () => {
      const next = nextItem();
      if (!next?.Id || prefetch?.uid === next.uid) return;
      const promise = negotiateAudio(next.Id, 0);
      prefetch = { uid: next.uid, at: Date.now(), promise };
      promise
        .then((src) => fetch(src.url, { headers: { Range: "bytes=0-262143" } }).then((r) => r.body?.cancel()))
        .catch(() => {});
    };

    const applyVolume = () => {
      const { volume, muted } = store.getState();
      el.volume = sliderToGain(volume);
      el.muted = muted;
    };

    /* ---------- sync with the store ---------- */
    let syncingUid: string | null = null;
    const syncCurrent = async () => {
      const cur = currentTrack(store.getState());
      if (!cur) {
        reportStop();
        unload();
        updateMetadata(null);
        clearResume();
        return;
      }
      if (loaded.uid === cur.uid || syncingUid === cur.uid) return;
      syncingUid = cur.uid;
      try {
        reportStop();
        updateMetadata(cur);
        // Undo-close resumes where it left off.
        // Undo-close / a refresh resume where it left off (only for that same entry).
        const resume = store.getState().resumeAt;
        const startAt = resume?.uid === cur.uid ? resume.t : 0;
        if (resume) store.setState({ resumeAt: null });
        const ok = await load(cur, startAt);
        if (!ok || currentTrack(store.getState())?.uid !== cur.uid) return;
        store.getState()._report({ currentTime: startAt, duration: (cur.RunTimeTicks ?? 0) / TICKS_PER_SECOND, error: null });
        if (store.getState().playing) play();
      } finally {
        if (syncingUid === cur.uid) syncingUid = null;
      }
    };

    /** Track changed while paused: show it; negotiate lazily when the user presses play. */
    const showPaused = (cur: QueueItem) => {
      reportStop();
      if (loaded.uid !== cur.uid) unload();
      updateMetadata(cur);
      setPlaybackState("paused");
      const resume = store.getState().resumeAt;
      store.getState()._report({ currentTime: resume?.uid === cur.uid ? resume.t : 0, duration: (cur.RunTimeTicks ?? 0) / TICKS_PER_SECOND, error: null });
    };

    /* ---------- element events ---------- */
    const handlers: Record<string, () => void> = {
      timeupdate: () => {
        // Clearing the element (unload) fires timeupdate at 0 with nothing loaded;
        // ignore it so a restored/paused position isn't wiped.
        if (!loaded.source) return;
        const duration = loaded.item?.RunTimeTicks ? loaded.item.RunTimeTicks / TICKS_PER_SECOND : el.duration || 0;
        store.getState()._report({ currentTime: position(), duration });
        updatePosition();
        if (performance.now() - lastResumeSave > RESUME_SAVE_MS) saveResumePoint();
      },
      playing: () => {
        log("event playing");
        store.getState()._report({ buffering: false, playing: true });
        setPlaybackState("playing");
        reportStart();
        reportProgress();
        prefetchNext();
      },
      pause: () => {
        log("event pause", { internal: internalPause, ended: el.ended });
        if (internalPause || el.ended) return;
        store.getState()._report({ playing: false });
        setPlaybackState("paused");
        reportProgress();
        saveResumePoint();
      },
      waiting: () => {
        log("event waiting");
        store.getState()._report({ buffering: true });
      },
      emptied: () => {
        internalPause = false;
      },
      stalled: () => log("event stalled"),
      suspend: () => log("event suspend"),
      ended: () => {
        log("event ended");
        reportStop();
        // Sleep timer "end of this song": stop here instead of moving on.
        if (store.getState().sleepEndOfTrack) {
          store.setState({ sleepEndOfTrack: false, playing: false });
          setPlaybackState("paused");
          return;
        }
        store.getState().next(true);
      },
      error: () => {
        if (!el.getAttribute("src")) return;
        log("event error", el.error);
        store.getState()._report({ error: "Couldn't play this track.", buffering: false });
        const { queue, index } = store.getState();
        if (index + 1 < queue.length) window.setTimeout(() => store.getState().next(true), 1200);
      },
    };
    for (const [ev, fn] of Object.entries(handlers)) el.addEventListener(ev, fn);

    // Sleep timer: pause when the time is up.
    const sleepTick = window.setInterval(() => {
      const { sleepAt, playing } = store.getState();
      if (sleepAt !== null && Date.now() >= sleepAt) {
        store.setState({ sleepAt: null });
        if (playing) store.getState().pause();
      }
    }, 1000);

    const onVisibility = () => log("visibilitychange");
    document.addEventListener("visibilitychange", onVisibility);

    /* ---------- Media Session actions ---------- */
    if (ms) {
      const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
        try {
          ms.setActionHandler(action, fn);
        } catch {
          /* unsupported action */
        }
      };
      set("play", () => {
        log("media key play");
        store.getState().setPlaying(true);
      });
      set("pause", () => {
        log("media key pause");
        store.getState().pause();
      });
      set("stop", () => {
        log("media key stop");
        store.getState().close();
      });
      set("previoustrack", () => store.getState().prev());
      set("nexttrack", () => store.getState().next());
      set("seekto", (d) => typeof d.seekTime === "number" && store.getState().seek(d.seekTime));
      set("seekbackward", (d) => store.getState().seek(store.getState().currentTime - (d.seekOffset ?? 10)));
      set("seekforward", (d) => store.getState().seek(store.getState().currentTime + (d.seekOffset ?? 10)));
    }

    /* ---------- react to store changes ---------- */
    applyVolume();
    const unsub = store.subscribe((state, prev) => {
      const cur = currentTrack(state);
      const prevCur = currentTrack(prev);

      if (cur?.uid !== prevCur?.uid) {
        if (!cur || state.playing) void syncCurrent();
        else showPaused(cur);
      } else if (cur && state.playing && !prev.playing && loaded.uid !== cur.uid) {
        void syncCurrent();
      } else if (state.playing !== prev.playing && cur && loaded.uid === cur.uid) {
        if (state.playing && el.paused) play();
        else if (!state.playing && !el.paused) {
          el.pause();
          setPlaybackState("paused");
        }
      }

      // Queue/repeat/shuffle edits can change what "next" is.
      if ((state.queue !== prev.queue || state.repeat !== prev.repeat || state.shuffle !== prev.shuffle) && prefetch && prefetch.uid !== nextItem()?.uid) {
        prefetch = null;
        if (!el.paused) prefetchNext();
      }

      if (state.volume !== prev.volume || state.muted !== prev.muted) applyVolume();

      if (state.seekRequest && state.seekRequest !== prev.seekRequest && loaded.item) {
        const t = state.seekRequest.time;
        // Loaded: the seek applies now, so the "start here on first load" note isn't needed.
        if (state.resumeAt) store.setState({ resumeAt: null });
        if (loaded.source?.canByteSeek) {
          el.currentTime = t;
          if (state.playing && el.paused) play();
          reportProgress();
        } else {
          // Progressive transcodes can't byte-range seek: re-negotiate at the offset.
          const wasPlaying = state.playing;
          void load(loaded.item, t).then((ok) => ok && wasPlaying && play());
        }
      }
    });

    // Back after a refresh (or within a day): same song, same spot, paused.
    const restored = currentTrack(store.getState());
    if (restored) {
      const point = readResume();
      if (point && point.uid === restored.uid && point.t > 0) store.setState({ resumeAt: point, currentTime: point.t });
      showPaused(restored);
    }

    return () => {
      window.clearInterval(sleepTick);
      unsub();
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      reportStop();
      for (const [ev, fn] of Object.entries(handlers)) el.removeEventListener(ev, fn);
      unload();
    };
  }, []);

  return <audio ref={audioRef} preload="auto" hidden />;
}
