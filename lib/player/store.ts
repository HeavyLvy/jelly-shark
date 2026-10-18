"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Persistent music player state (queue, transport, volume). The <AudioEngine>
 * in the root layout reacts to this store; UI components only read it and
 * call actions. Seeks are requested via `seekRequest` (the engine owns the
 * <audio> elements).
 */

export type RepeatMode = "off" | "all" | "one";
export type PlayerPanel = "none" | "queue" | "lyrics";

/** The slice of BaseItemDto the player keeps (small enough to persist). */
export type QueueItem = Pick<
  BaseItemDto,
  | "Id"
  | "Name"
  | "Album"
  | "AlbumId"
  | "AlbumArtist"
  | "Artists"
  | "ArtistItems"
  | "AlbumArtists"
  | "RunTimeTicks"
  | "ImageTags"
  | "AlbumPrimaryImageTag"
  | "ImageBlurHashes"
  | "IndexNumber"
  | "Type"
  | "ProductionYear"
  | "HasLyrics"
> & { uid: string; IsFavorite?: boolean };

export interface PlaySource {
  label: string;
  href?: string;
}

interface PlayerState {
  queue: QueueItem[];
  index: number;
  /** Original order before shuffling (uids), to restore on un-shuffle. */
  unshuffled: string[] | null;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  /** What the user wants (the engine mirrors it onto <audio>). */
  playing: boolean;
  /** Reported by the engine. */
  currentTime: number;
  duration: number;
  buffering: boolean;
  error: string | null;
  source: PlaySource | null;
  panel: PlayerPanel;
  seekRequest: { time: number; nonce: number } | null;
  /** What close() cleared, for the "Playback closed · Undo" toast (not persisted). */
  closed: ClosedSnapshot | null;
  /** Sleep timer: pause at this time (epoch ms), or after the current song. Not persisted. */
  sleepAt: number | null;
  sleepEndOfTrack: boolean;
  /** Minutes from now, "end" of the current song, or null to cancel. */
  setSleepTimer: (t: number | "end" | null) => void;
  /** Where to start a specific queue entry when it next loads (undo-close, resume after a refresh); used once. */
  resumeAt: { uid: string; t: number } | null;

  playItems: (items: BaseItemDto[], startIndex?: number, source?: PlaySource, opts?: { shuffle?: boolean }) => void;
  playNext: (items: BaseItemDto[]) => void;
  addToQueue: (items: BaseItemDto[]) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  move: (from: number, to: number) => void;
  clearQueue: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  pause: () => void;
  /** Stop playback and close the player (clears the queue). */
  stop: () => void;
  /** Like stop(), but remembers what was playing so the user can undo. */
  close: () => void;
  undoClose: () => void;
  dismissClosed: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPanel: (panel: PlayerPanel) => void;
  setFavorite: (itemId: string, favorite: boolean) => void;
  /** Engine-only reporters. */
  _report: (patch: Partial<Pick<PlayerState, "currentTime" | "duration" | "buffering" | "error" | "playing">>) => void;
}

interface ClosedSnapshot {
  queue: QueueItem[];
  index: number;
  unshuffled: string[] | null;
  source: PlaySource | null;
  currentTime: number;
  playing: boolean;
}

let uidCounter = 0;
function toQueueItem(item: BaseItemDto): QueueItem {
  uidCounter += 1;
  return {
    uid: `${item.Id}-${Date.now().toString(36)}-${uidCounter}`,
    Id: item.Id,
    Name: item.Name,
    Album: item.Album,
    AlbumId: item.AlbumId,
    AlbumArtist: item.AlbumArtist,
    Artists: item.Artists,
    ArtistItems: item.ArtistItems,
    AlbumArtists: item.AlbumArtists,
    RunTimeTicks: item.RunTimeTicks,
    ImageTags: item.ImageTags,
    AlbumPrimaryImageTag: item.AlbumPrimaryImageTag,
    ImageBlurHashes: item.ImageBlurHashes,
    IndexNumber: item.IndexNumber,
    Type: item.Type,
    ProductionYear: item.ProductionYear,
    HasLyrics: item.HasLyrics,
    IsFavorite: item.UserData?.IsFavorite ?? false,
  };
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      unshuffled: null,
      shuffle: false,
      repeat: "off",
      volume: 0.8,
      muted: false,
      playing: false,
      currentTime: 0,
      duration: 0,
      buffering: false,
      error: null,
      source: null,
      panel: "none",
      seekRequest: null,
      closed: null,
      resumeAt: null,
      sleepAt: null,
      sleepEndOfTrack: false,
      setSleepTimer: (t) =>
        set(t === null ? { sleepAt: null, sleepEndOfTrack: false } : t === "end" ? { sleepAt: null, sleepEndOfTrack: true } : { sleepAt: Date.now() + t * 60_000, sleepEndOfTrack: false }),

      playItems: (items, startIndex = 0, source, opts) => {
        const playable = items.filter((i) => i.Id && (i.Type === "Audio" || i.MediaType === "Audio"));
        if (playable.length === 0) return;
        const start = Math.min(Math.max(0, playable.findIndex((i) => i.Id === items[startIndex]?.Id)), playable.length - 1);
        let queue = playable.map(toQueueItem);
        const doShuffle = opts?.shuffle ?? get().shuffle;
        let unshuffled: string[] | null = null;
        let index = start;
        if (doShuffle) {
          unshuffled = queue.map((q) => q.uid);
          const first = queue[opts?.shuffle ? Math.floor(Math.random() * queue.length) : start];
          queue = [first, ...shuffled(queue.filter((q) => q.uid !== first.uid))];
          index = 0;
        }
        set({ queue, index, unshuffled, shuffle: doShuffle, playing: true, currentTime: 0, duration: 0, error: null, source: source ?? null, closed: null, resumeAt: null });
      },

      playNext: (items) => {
        const add = items.filter((i) => i.Id).map(toQueueItem);
        if (add.length === 0) return;
        const { queue, index } = get();
        if (queue.length === 0) return get().playItems(items);
        set({ queue: [...queue.slice(0, index + 1), ...add, ...queue.slice(index + 1)] });
      },

      addToQueue: (items) => {
        const add = items.filter((i) => i.Id).map(toQueueItem);
        if (add.length === 0) return;
        if (get().queue.length === 0) return get().playItems(items);
        set({ queue: [...get().queue, ...add] });
      },

      jumpTo: (index) => {
        if (index < 0 || index >= get().queue.length) return;
        set({ index, playing: true, currentTime: 0, error: null, resumeAt: null });
      },

      removeAt: (i) => {
        const { queue, index } = get();
        if (i < 0 || i >= queue.length) return;
        const next = queue.filter((_, k) => k !== i);
        if (next.length === 0) return get().clearQueue();
        let newIndex = index;
        if (i < index) newIndex = index - 1;
        else if (i === index) newIndex = Math.min(index, next.length - 1);
        set({ queue: next, index: newIndex, ...(i === index ? { currentTime: 0 } : {}) });
      },

      move: (from, to) => {
        const { queue, index } = get();
        if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
        const next = [...queue];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const current = queue[index]?.uid;
        set({ queue: next, index: Math.max(0, next.findIndex((q) => q.uid === current)) });
      },

      clearQueue: () => set({ queue: [], index: 0, unshuffled: null, playing: false, currentTime: 0, duration: 0, source: null, panel: "none" }),

      next: (auto = false) => {
        const { queue, index, repeat } = get();
        if (queue.length === 0) return;
        if (auto && repeat === "one") return set({ seekRequest: { time: 0, nonce: Date.now() }, playing: true, resumeAt: null });
        if (index + 1 < queue.length) return set({ index: index + 1, currentTime: 0, playing: true, error: null, resumeAt: null });
        if (repeat === "all" || !auto) return set({ index: 0, currentTime: 0, playing: auto ? true : get().playing, error: null, resumeAt: null });
        set({ playing: false });
      },

      prev: () => {
        const { index, currentTime, queue, repeat } = get();
        if (currentTime > 3 || queue.length === 0) return set({ seekRequest: { time: 0, nonce: Date.now() }, currentTime: 0, resumeAt: null });
        if (index > 0) return set({ index: index - 1, currentTime: 0, error: null, resumeAt: null });
        if (repeat === "all") return set({ index: queue.length - 1, currentTime: 0, error: null, resumeAt: null });
        set({ seekRequest: { time: 0, nonce: Date.now() }, currentTime: 0, resumeAt: null });
      },

      togglePlay: () => set({ playing: !get().playing }),
      setPlaying: (playing) => set({ playing }),
      pause: () => set({ playing: false }),
      stop: () => get().clearQueue(),
      close: () => {
        const { queue, index, unshuffled, source, currentTime, playing } = get();
        if (queue.length === 0) return;
        get().clearQueue();
        set({ closed: { queue, index, unshuffled, source, currentTime, playing } });
      },
      undoClose: () => {
        const c = get().closed;
        if (!c) return;
        set({ queue: c.queue, index: c.index, unshuffled: c.unshuffled, source: c.source, currentTime: c.currentTime, resumeAt: c.queue[c.index] ? { uid: c.queue[c.index].uid, t: c.currentTime } : null, playing: c.playing, error: null, closed: null });
      },
      dismissClosed: () => set({ closed: null }),
      seek: (time) => {
        const t = Math.max(0, time);
        const cur = get().queue[get().index];
        // Before anything has loaded (e.g. paused after a refresh), remember the spot for the first load.
        set({ seekRequest: { time: t, nonce: Date.now() }, currentTime: t, resumeAt: cur ? { uid: cur.uid, t } : null });
      },
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set({ muted: !get().muted }),

      toggleShuffle: () => {
        const { shuffle, queue, index, unshuffled } = get();
        const current = queue[index];
        if (!current) return set({ shuffle: !shuffle });
        if (!shuffle) {
          const rest = shuffled(queue.filter((_, k) => k !== index));
          set({ shuffle: true, unshuffled: queue.map((q) => q.uid), queue: [current, ...rest], index: 0 });
        } else {
          const order = unshuffled ?? [];
          const byUid = new Map(queue.map((q) => [q.uid, q]));
          const restored = [...order.map((u) => byUid.get(u)).filter((q): q is QueueItem => !!q), ...queue.filter((q) => !order.includes(q.uid))];
          set({ shuffle: false, unshuffled: null, queue: restored, index: Math.max(0, restored.findIndex((q) => q.uid === current.uid)) });
        }
      },

      cycleRepeat: () => set({ repeat: get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off" }),
      setPanel: (panel) => set({ panel: get().panel === panel ? "none" : panel }),
      setFavorite: (itemId, favorite) => set({ queue: get().queue.map((q) => (q.Id === itemId ? { ...q, IsFavorite: favorite } : q)) }),
      _report: (patch) => set(patch),
    }),
    {
      name: "jelly-shark-player",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated manually by <AudioEngine> after mount (avoids SSR mismatch).
      skipHydration: true,
      partialize: (s) => ({ queue: s.queue, index: s.index, unshuffled: s.unshuffled, shuffle: s.shuffle, repeat: s.repeat, volume: s.volume, muted: s.muted, source: s.source }),
    },
  ),
);

export function currentTrack(s: Pick<PlayerState, "queue" | "index">): QueueItem | null {
  return s.queue[s.index] ?? null;
}
