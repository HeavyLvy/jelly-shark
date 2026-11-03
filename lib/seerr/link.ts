import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/db/schema";
import { seerrCall } from "./client";
import type { SeerrConfig } from "./config";

/**
 * Which Seerr account a Jellyfin user acts as. By default it's the Seerr user
 * whose Jellyfin id matches; if there is none yet, Seerr imports them from
 * Jellyfin the first time. An administrator can instead pin a person to a
 * particular Seerr account (the "override").
 */

export interface SeerrUserInfo {
  id: number;
  name: string;
  jellyfinUserId: string | null;
}

const KEY = "seerr-links";

/** Jellyfin ids show up with and without dashes and in either case; compare them the same way. */
export function normalizeJellyfinId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/* ---------- admin overrides (instance_settings) ---------- */

export function getOverrides(): Record<string, number> {
  const row = db().select().from(instanceSettings).where(eq(instanceSettings.key, KEY)).get();
  if (!row) return {};
  try {
    const v = JSON.parse(row.value) as unknown;
    const out: Record<string, number> = {};
    if (typeof v === "object" && v !== null) {
      for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isInteger(n) && n > 0) out[normalizeJellyfinId(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** `seerrUserId: null` goes back to automatic. */
export function setOverride(jellyfinUserId: string, seerrUserId: number | null): void {
  const all = getOverrides();
  const key = normalizeJellyfinId(jellyfinUserId);
  if (seerrUserId === null) delete all[key];
  else all[key] = seerrUserId;
  const now = Date.now();
  const value = JSON.stringify(all);
  db().insert(instanceSettings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedAt: now } }).run();
  cache.clear();
}

/* ---------- Seerr's users ---------- */

/** Every Seerr user (paged). Empty when Seerr doesn't answer sensibly. */
export async function listSeerrUsers(config: SeerrConfig): Promise<SeerrUserInfo[]> {
  const out: SeerrUserInfo[] = [];
  for (let skip = 0; skip < 5000; skip += 100) {
    const { status, data } = await seerrCall(config, `/user?take=100&skip=${skip}&sort=created`);
    const results = status === 200 && typeof data === "object" && data !== null ? (data as { results?: unknown }).results : null;
    if (!Array.isArray(results)) break;
    for (const u of results) {
      if (typeof u !== "object" || u === null) continue;
      const r = u as { id?: unknown; displayName?: unknown; jellyfinUsername?: unknown; username?: unknown; jellyfinUserId?: unknown };
      if (typeof r.id !== "number") continue;
      const name = [r.displayName, r.jellyfinUsername, r.username].find((n): n is string => typeof n === "string" && n !== "") ?? `User ${r.id}`;
      out.push({ id: r.id, name, jellyfinUserId: typeof r.jellyfinUserId === "string" && r.jellyfinUserId ? r.jellyfinUserId : null });
    }
    if (results.length < 100) break;
  }
  return out;
}

/* ---------- finding the account ---------- */

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { id: number; at: number }>();

export type Resolved = { ok: true; seerrUserId: number } | { ok: false; error: "no_account" | "unreachable" };

/**
 * The Seerr user to act as for a Jellyfin user: the admin's override, else the
 * matching account, else one imported from Jellyfin on the spot.
 */
export async function resolveSeerrUser(config: SeerrConfig, jellyfinUserId: string): Promise<Resolved> {
  const jf = normalizeJellyfinId(jellyfinUserId);
  const override = getOverrides()[jf];
  if (override) return { ok: true, seerrUserId: override };
  const hit = cache.get(jf);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, seerrUserId: hit.id };

  try {
    const find = async () => (await listSeerrUsers(config)).find((u) => u.jellyfinUserId && normalizeJellyfinId(u.jellyfinUserId) === jf);
    let user = await find();
    if (!user) {
      const imported = await seerrCall(config, "/user/import-from-jellyfin", { method: "POST", body: { jellyfinUserIds: [jellyfinUserId] } });
      if (imported.status >= 200 && imported.status < 300) user = await find();
    }
    if (!user) return { ok: false, error: "no_account" };
    cache.set(jf, { id: user.id, at: Date.now() });
    return { ok: true, seerrUserId: user.id };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
