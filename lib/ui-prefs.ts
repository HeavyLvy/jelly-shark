"use client";

import { useSyncExternalStore } from "react";
import { persistSetting, onSettingsSynced } from "./settings-sync";
import { POSTER_WIDTH } from "./ui-config";

/**
 * App-wide display preferences, per browser (localStorage): poster size and
 * which Home rows to show. Read with useUiPrefs(); change with setUiPrefs().
 */
export type PosterSize = "small" | "default" | "large";
export type HomeRowId = "continue" | "popular" | "favorites" | "recentlyWatched" | "recentlyAdded" | "becauseYouWatched" | "music";

export const HOME_ROWS: { id: HomeRowId; label: string }[] = [
  { id: "continue", label: "Continue Watching" },
  { id: "popular", label: "Most Popular" },
  { id: "favorites", label: "Your Favorites" },
  { id: "recentlyWatched", label: "Recently Watched" },
  { id: "recentlyAdded", label: "Recently Added" },
  { id: "becauseYouWatched", label: "Because You Watched" },
  { id: "music", label: "Jump Back Into Music" },
];

export interface UiPrefs {
  posterSize: PosterSize;
  hiddenRows: HomeRowId[];
}

const KEY = "jelly-shark-ui";
const DEFAULTS: UiPrefs = { posterSize: "default", hiddenRows: [] };
const listeners = new Set<() => void>();
let current: UiPrefs | null = null;

function read(): UiPrefs {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<UiPrefs>;
    return {
      posterSize: p.posterSize === "small" || p.posterSize === "large" ? p.posterSize : "default",
      hiddenRows: Array.isArray(p.hiddenRows) ? p.hiddenRows.filter((r): r is HomeRowId => HOME_ROWS.some((h) => h.id === r)) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

export function setUiPrefs(patch: Partial<UiPrefs>) {
  current = { ...(current ?? read()), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage unavailable: lasts until reload
  }
  persistSetting("ui", current);
  listeners.forEach((l) => l());
}

// After the server copy is pulled, drop the cached value so it's re-read from localStorage.
onSettingsSynced(() => {
  current = null;
  listeners.forEach((l) => l());
});

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (current ??= read()),
    () => DEFAULTS,
  );
}

/** Poster width in px for the chosen size (Default = NEXT_PUBLIC_POSTER_WIDTH). */
export function posterWidthFor(size: PosterSize): number {
  return size === "small" ? Math.round(POSTER_WIDTH * 0.8) : size === "large" ? Math.round(POSTER_WIDTH * 1.2) : POSTER_WIDTH;
}

export function usePosterWidth(): number {
  return posterWidthFor(useUiPrefs().posterSize);
}
