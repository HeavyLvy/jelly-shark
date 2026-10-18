"use client";

import { persistSetting } from "@/lib/settings-sync";

/**
 * Per-browser video preferences (localStorage): last chosen audio/subtitle
 * language, quality cap and volume. Read when negotiating playback, written
 * when the user changes a track. Storage errors are ignored.
 */

export interface VideoPrefs {
  /** ISO language of the last audio track the user picked (null = file default). */
  audioLang: string | null;
  /** ISO language of the last subtitle picked; "off" = subtitles disabled. */
  subtitleLang: string | "off";
  /** Last subtitle language actually turned on (kept when subtitles go off; "c" restores it). */
  lastSubtitleLang: string | null;
  /** Max bitrate in bits/s; null = auto. */
  maxBitrate: number | null;
  volume: number;
  muted: boolean;
  /** Use the browser's own video controls instead of Jelly Shark's (handy on phones). */
  nativeControls: boolean;
  subtitleSize: SubtitleSize;
  subtitleStyle: SubtitleStyle;
  /** Count down and play the next episode when one ends. */
  autoplayNext: boolean;
}

export type SubtitleSize = "small" | "medium" | "large" | "xlarge";
export type SubtitleStyle = "box" | "shadow";
export const SUBTITLE_SIZES: { value: SubtitleSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "xlarge", label: "XL" },
];
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const KEY = "jelly-shark-video-prefs";
const DEFAULTS: VideoPrefs = { audioLang: null, subtitleLang: "off", lastSubtitleLang: null, maxBitrate: null, volume: 0.9, muted: false, nativeControls: false, subtitleSize: "medium", subtitleStyle: "box", autoplayNext: true };

export function readVideoPrefs(): VideoPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<VideoPrefs>;
    return {
      audioLang: typeof p.audioLang === "string" ? p.audioLang : null,
      subtitleLang: typeof p.subtitleLang === "string" ? p.subtitleLang : "off",
      lastSubtitleLang: typeof p.lastSubtitleLang === "string" ? p.lastSubtitleLang : null,
      maxBitrate: typeof p.maxBitrate === "number" ? p.maxBitrate : null,
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
      muted: p.muted === true,
      nativeControls: p.nativeControls === true,
      subtitleSize: SUBTITLE_SIZES.some((s) => s.value === p.subtitleSize) ? (p.subtitleSize as SubtitleSize) : "medium",
      subtitleStyle: p.subtitleStyle === "shadow" ? "shadow" : "box",
      autoplayNext: p.autoplayNext !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeVideoPrefs(patch: Partial<VideoPrefs>) {
  const next = { ...readVideoPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  persistSetting("video", next);
}

/** Quality menu options (bits/s); null = Auto. */
export const QUALITY_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Auto", value: null },
  { label: "1080p · 20 Mbps", value: 20_000_000 },
  { label: "1080p · 10 Mbps", value: 10_000_000 },
  { label: "720p · 6 Mbps", value: 6_000_000 },
  { label: "720p · 4 Mbps", value: 4_000_000 },
  { label: "480p · 2 Mbps", value: 2_000_000 },
  { label: "360p · 1 Mbps", value: 1_000_000 },
];
