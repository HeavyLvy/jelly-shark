import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/db/schema";

/**
 * The Seerr connection, saved by an administrator. It is instance-wide, and the
 * API key stays on the server: nothing here is ever sent to the browser.
 */
export interface SeerrConfig {
  /** Base address without a trailing slash, e.g. `http://192.168.1.10:5055`. */
  url: string;
  apiKey: string;
}

const KEY = "seerr";

/** The saved connection, or null when Seerr isn't set up (or the saved value is damaged). */
export function getSeerrConfig(): SeerrConfig | null {
  const row = db().select().from(instanceSettings).where(eq(instanceSettings.key, KEY)).get();
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as { url?: unknown; apiKey?: unknown };
    if (typeof v.url === "string" && v.url && typeof v.apiKey === "string" && v.apiKey) return { url: v.url, apiKey: v.apiKey };
  } catch {
    // damaged value: behave as if nothing was saved
  }
  return null;
}

export function saveSeerrConfig(config: SeerrConfig): void {
  const now = Date.now();
  const value = JSON.stringify({ url: config.url, apiKey: config.apiKey });
  db().insert(instanceSettings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedAt: now } }).run();
}

export function clearSeerrConfig(): void {
  db().delete(instanceSettings).where(eq(instanceSettings.key, KEY)).run();
}
