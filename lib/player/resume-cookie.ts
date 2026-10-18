/**
 * Where the music was, in a short-lived cookie: a refresh, or closing the tab
 * and coming back within a day, brings the current song back at that spot.
 * (The queue itself is persisted in localStorage by the player store.)
 * Not httpOnly on purpose: only the client reads it; it holds a queue-entry
 * id and a time, nothing sensitive.
 */
const NAME = "jelly-shark-resume";
/** Expires a day after the last save. */
const MAX_AGE = 60 * 60 * 24;

export interface ResumePoint {
  /** QueueItem.uid of the song. */
  uid: string;
  /** Seconds into the song. */
  t: number;
}

export function saveResume(point: ResumePoint) {
  const value = encodeURIComponent(JSON.stringify({ uid: point.uid, t: Math.floor(point.t) }));
  document.cookie = `${NAME}=${value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax`;
}

export function readResume(): ResumePoint | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${NAME}=`));
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw.slice(NAME.length + 1))) as Partial<ResumePoint>;
    return typeof p.uid === "string" && typeof p.t === "number" && p.t >= 0 ? { uid: p.uid, t: p.t } : null;
  } catch {
    return null;
  }
}

export function clearResume() {
  document.cookie = `${NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}
