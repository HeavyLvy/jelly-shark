"use client";

import { useSyncExternalStore } from "react";

/**
 * Recent search terms, per scope, in localStorage (per-browser convenience
 * only). Empty during SSR/hydration; storage errors (private mode) are ignored.
 */

export type SearchScope = "all" | "music";

const KEY = "jelly-shark-recent-searches";
const MAX = 10;
const EMPTY: Record<SearchScope, string[]> = { all: [], music: [] };

let cache: Record<SearchScope, string[]> | null = null;
const listeners = new Set<() => void>();

function read(): Record<SearchScope, string[]> {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<SearchScope, unknown>>) : {};
    const clean = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX) : []);
    cache = { all: clean(parsed.all), music: clean(parsed.music) };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

function write(next: Record<SearchScope, string[]>) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — keep the in-memory copy
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecentSearches(scope: SearchScope): string[] {
  const all = useSyncExternalStore(subscribe, read, () => EMPTY);
  return all[scope];
}

export function addRecentSearch(scope: SearchScope, term: string) {
  const t = term.trim();
  if (t.length < 2) return;
  const cur = read();
  write({ ...cur, [scope]: [t, ...cur[scope].filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX) });
}

export function removeRecentSearch(scope: SearchScope, term: string) {
  const cur = read();
  write({ ...cur, [scope]: cur[scope].filter((x) => x !== term) });
}

export function clearRecentSearches(scope: SearchScope) {
  write({ ...read(), [scope]: [] });
}
