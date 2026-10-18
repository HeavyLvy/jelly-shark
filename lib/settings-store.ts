import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/**
 * Per-user settings, stored as JSON values under a small set of keys
 * (see SETTING_KEYS). The browser keeps a localStorage copy for instant
 * reads; this is the source of truth that follows the user across devices.
 */
export const SETTING_KEYS = ["video", "ui", "popularPeriod"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Upper bound per value, so a client can't fill the disk. */
const MAX_VALUE_BYTES = 16 * 1024;

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

export function getSettings(userId: string): Partial<Record<SettingKey, unknown>> {
  const rows = db().select({ key: settings.key, value: settings.value }).from(settings).where(eq(settings.userId, userId)).all();
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const { key, value } of rows) {
    if (!isSettingKey(key)) continue;
    try {
      out[key] = JSON.parse(value);
    } catch {
      // unreadable value: skip it, the client re-sends a fresh one
    }
  }
  return out;
}

/** Validates and upserts the given keys in one transaction. Returns an error message, or null. */
export function setSettings(userId: string, patch: Record<string, unknown>): string | null {
  const entries = Object.entries(patch);
  if (entries.length === 0) return "empty";
  const rows: { userId: string; key: SettingKey; value: string; updatedAt: number }[] = [];
  const now = Date.now();
  for (const [key, value] of entries) {
    if (!isSettingKey(key)) return `unknown setting: ${key}`;
    const json = JSON.stringify(value);
    if (json === undefined || json.length > MAX_VALUE_BYTES) return `invalid value for ${key}`;
    rows.push({ userId, key, value: json, updatedAt: now });
  }
  db().transaction((tx) => {
    for (const row of rows) {
      tx.insert(settings)
        .values(row)
        .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: sql`excluded.value`, updatedAt: row.updatedAt } })
        .run();
    }
  });
  return null;
}

/** Remove one setting (used by tests and future "reset" actions). */
export function deleteSetting(userId: string, key: SettingKey): void {
  db().delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, key))).run();
}
