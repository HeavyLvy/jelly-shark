"use client";

import { useSyncExternalStore } from "react";

/**
 * Keeps the browser's settings in step with the server database
 * (/api/settings → SQLite). localStorage stays as a fast local copy; the
 * server copy is the source of truth, so settings follow the user to other
 * devices and survive clearing browser data.
 *
 * - Writes: stores call persistSetting() after saving locally; changes are
 *   batched (~400 ms) into one PUT.
 * - On sign-in/load: syncSettingsFromServer() pulls the user's settings into
 *   localStorage; anything the server doesn't have yet is uploaded from this
 *   browser (one-time migration), unless the local copy belongs to another user.
 */
export type SettingKey = "video" | "ui" | "popularPeriod";

const LOCAL: Record<SettingKey, { key: string; json: boolean }> = {
  video: { key: "jelly-shark-video-prefs", json: true },
  ui: { key: "jelly-shark-ui", json: true },
  popularPeriod: { key: "jelly-shark-popular-period", json: false },
};
const OWNER_KEY = "jelly-shark-settings-owner";
const SYNCED_EVENT = "jelly:settings-synced";
const FLUSH_MS = 400;

let pending: Partial<Record<SettingKey, unknown>> = {};
/** Keys changed here before the first pull finished: the pull must not overwrite them. */
const dirty = new Set<SettingKey>();
let pulled = false;
let timer: number | undefined;
let version = 0;
const listeners = new Set<() => void>();

function readLocal(key: SettingKey): unknown {
  try {
    const raw = window.localStorage.getItem(LOCAL[key].key);
    if (raw === null) return undefined;
    return LOCAL[key].json ? JSON.parse(raw) : raw;
  } catch {
    return undefined;
  }
}

function writeLocal(key: SettingKey, value: unknown) {
  try {
    window.localStorage.setItem(LOCAL[key].key, LOCAL[key].json ? JSON.stringify(value) : String(value));
  } catch {
    // storage unavailable
  }
}

function flush() {
  timer = undefined;
  const body = pending;
  pending = {};
  if (Object.keys(body).length === 0) return;
  void fetch("/api/settings", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {
    // offline: the local copy is kept, and it's re-uploaded on the next sign-in if the server lacks it
  });
}

/** Call after saving a setting locally; it is sent to the server shortly after. */
export function persistSetting(key: SettingKey, value: unknown) {
  if (typeof window === "undefined") return;
  if (!pulled) dirty.add(key);
  pending[key] = value;
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, FLUSH_MS);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", () => timer !== undefined && (window.clearTimeout(timer), flush()));

/** Pull this user's settings from the server (and migrate anything only this browser has). */
export async function syncSettingsFromServer(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/settings", { cache: "no-store" });
  } catch {
    return;
  }
  if (!res.ok) return;
  const { userId, settings } = (await res.json()) as { userId: string; settings: Partial<Record<SettingKey, unknown>> };

  // Local settings left by a different account on this browser aren't this user's.
  const owner = window.localStorage.getItem(OWNER_KEY);
  const foreign = owner !== null && owner !== userId;
  if (foreign) for (const k of Object.keys(LOCAL) as SettingKey[]) window.localStorage.removeItem(LOCAL[k].key);
  try {
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // storage unavailable
  }

  const upload: Partial<Record<SettingKey, unknown>> = {};
  for (const key of Object.keys(LOCAL) as SettingKey[]) {
    if (dirty.has(key)) continue; // changed here a moment ago; it's already queued for upload
    if (settings[key] !== undefined) writeLocal(key, settings[key]);
    else {
      const local = readLocal(key);
      if (local !== undefined) upload[key] = local; // first run after the database was added
    }
  }
  pulled = true;
  dirty.clear();
  if (Object.keys(upload).length) {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(upload) }).catch(() => {});
  }
  version += 1;
  window.dispatchEvent(new Event(SYNCED_EVENT));
  listeners.forEach((l) => l());
}

/** Increments each time a pull finished, so views can re-read their settings. */
export function useSettingsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
}

/** For stores that cache settings in memory: run `fn` after each pull. */
export function onSettingsSynced(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SYNCED_EVENT, fn);
  return () => window.removeEventListener(SYNCED_EVENT, fn);
}
