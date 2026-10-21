"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The event Chromium browsers fire when the app can be installed (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Captured by the inline script in the root layout, which runs before React does. */
    __jellyInstall?: InstallPromptEvent | null;
  }
}

/** Fired by the layout's script when the install prompt becomes available (or is used up). */
const READY_EVENT = "jelly:install-ready";
/** Fire to open the "how to install" dialog: window.dispatchEvent(new Event(OPEN_INSTALL)). */
export const OPEN_INSTALL = "jelly:install";

export type InstallPlatform = "ios" | "android" | "desktop";

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(READY_EVENT, cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(READY_EVENT, cb);
    mq.removeEventListener("change", cb);
  };
}

// One string so useSyncExternalStore sees a stable snapshot: "<installed>|<can prompt>".
const snapshot = () => `${standalone()}|${!!window.__jellyInstall}`;

export function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, but has a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Whether Jelly Shark is running as an installed app, and how to install it.
 * Chromium browsers (Chrome, Edge, Android) can install with one tap (`canPrompt`);
 * everything else, including every iPhone, needs the "Add to Home Screen" steps
 * (see InstallDialog), because Safari has no install API.
 */
export function useInstall() {
  const state = useSyncExternalStore(subscribe, snapshot, () => "false|false");
  const [installed, canPrompt] = state.split("|").map((v) => v === "true");

  /** Install with the browser's own prompt when there is one, else open the steps. */
  const install = useCallback(async () => {
    const event = window.__jellyInstall;
    if (!event) {
      window.dispatchEvent(new Event(OPEN_INSTALL));
      return;
    }
    await event.prompt();
    // The browser allows the prompt once per event; whatever the answer, it's used up.
    window.__jellyInstall = null;
    window.dispatchEvent(new Event(READY_EVENT));
  }, []);

  return { installed, canPrompt, install };
}
