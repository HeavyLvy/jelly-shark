import { useSyncExternalStore } from "react";

/**
 * Current time, browser-only. Returns null during SSR/prerender (Cache
 * Components forbids reading the clock there) and ticks every 30s after
 * mount, so "Ends at" / "New" badges stay correct without hydration issues.
 */
let now: Date | null = null;
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (timer === undefined) {
    now = new Date();
    timer = window.setInterval(() => {
      now = new Date();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): Date | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}
