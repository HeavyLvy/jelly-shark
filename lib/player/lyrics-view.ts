"use client";

import { useSyncExternalStore } from "react";

/**
 * How the lyrics are shown:
 *  - panel:      the floating glass panel
 *  - expanded:   opaque and nearly full-width, navbar still visible
 *  - fullscreen: covers everything and puts the browser in fullscreen
 *
 * Lives outside the player store so it survives track changes and isn't saved.
 */
export type LyricsMode = "panel" | "expanded" | "fullscreen";

let mode: LyricsMode = "panel";
/** Where Esc / "exit fullscreen" returns to. */
let before: Exclude<LyricsMode, "fullscreen"> = "panel";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setLyricsMode(next: LyricsMode) {
  if (next === mode) return;
  if (next === "fullscreen") before = mode === "fullscreen" ? before : mode;
  mode = next;
  emit();
}

/** Leave fullscreen, back to the mode it was entered from. */
export function exitLyricsFullscreen() {
  if (mode === "fullscreen") setLyricsMode(before);
}

export function useLyricsMode(): LyricsMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => mode,
    () => "panel",
  );
}
