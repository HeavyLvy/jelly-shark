import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/** Jellyfin "ticks" are 100ns units: 10,000,000 per second. */
export const TICKS_PER_SECOND = 10_000_000;
export const TICKS_PER_MS = 10_000;

export function ticksToSeconds(ticks: number | null | undefined): number {
  return ticks ? ticks / TICKS_PER_SECOND : 0;
}

/** "2h 04m", "52m", "45s" (used for runtimes). */
export function formatRuntime(ticks: number | null | undefined): string | null {
  if (!ticks || ticks <= 0) return null;
  const totalMinutes = Math.round(ticks / TICKS_PER_SECOND / 60);
  if (totalMinutes < 1) return `${Math.round(ticks / TICKS_PER_SECOND)}s`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** "18m left", "1h 12m left" from user data; null when nothing is in progress. */
export function formatTimeLeft(item: BaseItemDto): string | null {
  const total = item.RunTimeTicks ?? 0;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  if (!total || !pos || pos >= total) return null;
  const left = formatRuntime(total - pos);
  return left ? `${left} left` : null;
}

/** 0–100 progress for in-progress items, else null. */
export function playedPercent(item: BaseItemDto): number | null {
  const pct = item.UserData?.PlayedPercentage;
  if (typeof pct === "number" && pct > 0 && pct < 100) return pct;
  const total = item.RunTimeTicks ?? 0;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  if (total > 0 && pos > 0 && pos < total) return (pos / total) * 100;
  return null;
}

/** "1:42" / "1:02:09" media clock. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * "Ends at 9:41 PM" — must only be computed in the browser after mount
 * (cacheComponents prerendering forbids reading the current time).
 */
export function formatEndsAt(remainingTicks: number | null | undefined, now: Date): string | null {
  if (!remainingTicks || remainingTicks <= 0) return null;
  const end = new Date(now.getTime() + remainingTicks / TICKS_PER_MS);
  return `Ends at ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/** Remaining runtime honoring the resume point. */
export function remainingTicks(item: BaseItemDto): number {
  const total = item.RunTimeTicks ?? 0;
  const pos = item.UserData?.PlaybackPositionTicks ?? 0;
  return Math.max(0, total - pos);
}

/** "S2:E4" for episodes. */
export function episodeCode(item: BaseItemDto): string | null {
  if (item.ParentIndexNumber == null || item.IndexNumber == null) return null;
  return `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
}

/** "2023 – 2025" / "2023 – " (continuing) / "2023" for series; year for others. */
export function formatYears(item: BaseItemDto): string | null {
  const start = item.ProductionYear ?? (item.PremiereDate ? new Date(item.PremiereDate).getUTCFullYear() : null);
  if (!start) return null;
  if (item.Type !== "Series") return String(start);
  if (item.Status === "Continuing") return `${start} – Present`;
  const end = item.EndDate ? new Date(item.EndDate).getUTCFullYear() : null;
  return end && end !== start ? `${start} – ${end}` : String(start);
}

export function formatRating(value: number | null | undefined): string | null {
  return typeof value === "number" && value > 0 ? value.toFixed(1) : null;
}

/** Human type label for card sublines. */
export function typeLabel(item: BaseItemDto): string {
  switch (item.Type) {
    case "Movie":
      return "Movie";
    case "Series":
      return "TV";
    case "Episode":
      return "Episode";
    case "BoxSet":
      return "Collection";
    case "MusicAlbum":
      return "Album";
    case "MusicArtist":
      return "Artist";
    case "Audio":
      return "Song";
    default:
      return item.Type ?? "";
  }
}

/** Joins non-empty parts with a middle dot ("Movie · 2023"). */
export function dotJoin(...parts: (string | number | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "").join(" · ");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the item was added within `days` of `now` (browser-only: needs the current time). */
export function isRecentlyAdded(item: BaseItemDto, now: Date, days = 7): boolean {
  const created = item.DateCreated ? Date.parse(item.DateCreated) : NaN;
  return Number.isFinite(created) && now.getTime() - created < days * DAY_MS;
}
