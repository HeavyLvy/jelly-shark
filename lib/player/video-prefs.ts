"use client";

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
  /** Max bitrate in bits/s; null = auto. */
  maxBitrate: number | null;
  volume: number;
  muted: boolean;
}

const KEY = "jelly-shark-video-prefs";
const DEFAULTS: VideoPrefs = { audioLang: null, subtitleLang: "off", maxBitrate: null, volume: 0.9, muted: false };

export function readVideoPrefs(): VideoPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<VideoPrefs>;
    return {
      audioLang: typeof p.audioLang === "string" ? p.audioLang : null,
      subtitleLang: typeof p.subtitleLang === "string" ? p.subtitleLang : "off",
      maxBitrate: typeof p.maxBitrate === "number" ? p.maxBitrate : null,
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
      muted: p.muted === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeVideoPrefs(patch: Partial<VideoPrefs>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readVideoPrefs(), ...patch }));
  } catch {
    // storage unavailable
  }
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
