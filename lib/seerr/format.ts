import type { SeerrDetail } from "./types";

/** Display helpers for the Seerr pages. Pure, so they are easy to test. */

/** 136 → "2h 16m", 45 → "45m". */
export function formatMinutes(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** `2019-05-03` → "May 3, 2019" (in the viewer's language). Built from the parts, so the time zone can't shift the day. */
export function formatDay(iso: string | null | undefined, locale?: string): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** 63000000 → "$63M", 463_517_383 → "$464M", 1_200_000_000 → "$1.2B", 950_000 → "$950K". */
export function formatMoney(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  // One decimal for small figures ("$1.2B"), none once it is three digits ("$464M").
  const trim = (v: number) => String(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  if (n >= 1e9) return `$${trim(n / 1e9)}B`;
  if (n >= 1e6) return `$${trim(n / 1e6)}M`;
  if (n >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${n}`;
}

/** `en` → "English". Falls back to the code. */
export function languageName(code: string | null | undefined, locale = "en"): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const STILL_RUNNING = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

/** "2008", "2008–2013", or "2020–Present" for a show that's still going. Movies get their release year. */
export function yearsOf(d: Pick<SeerrDetail, "item" | "date" | "lastDate" | "statusText">): string | null {
  const first = d.date?.slice(0, 4) ?? d.item.year;
  if (!first) return null;
  if (d.item.mediaType === "movie") return first;
  if (d.statusText && STILL_RUNNING.has(d.statusText)) return `${first}–Present`;
  const last = d.lastDate?.slice(0, 4);
  return last && last !== first ? `${first}–${last}` : first;
}

/** "3 Seasons" / "1 Season". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
