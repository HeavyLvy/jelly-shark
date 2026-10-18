import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/db/schema";
import { jellyfinUrl } from "@/lib/env";
import { readPendingServer, type Account } from "@/lib/session";

/**
 * Which Jellyfin server Jelly Shark talks to.
 *
 * - The instance default: an address saved by an admin in Settings, else the
 *   JELLYFIN_URL environment variable.
 * - Policy "locked" (the default): everyone uses the instance default.
 * - Policy "users": a person may sign in to a server of their own on the
 *   sign-in screen; that profile then remembers it (Account.serverUrl).
 */
export type ServerPolicy = "locked" | "users";

export interface ServerConfig {
  /** From JELLYFIN_URL: what the default falls back to. */
  envUrl: string;
  /** The address everyone uses unless they chose their own. */
  defaultUrl: string;
  policy: ServerPolicy;
  /** True when an admin saved an address (so "reset" has something to do). */
  custom: boolean;
}

const KEY = "server";

export function getServerConfig(): ServerConfig {
  const envUrl = jellyfinUrl();
  const row = db().select().from(instanceSettings).where(eq(instanceSettings.key, KEY)).get();
  let saved: { url?: unknown; policy?: unknown } = {};
  try {
    saved = row ? (JSON.parse(row.value) as typeof saved) : {};
  } catch {
    // damaged value: behave as if nothing was saved
  }
  const savedUrl = typeof saved.url === "string" && normalizeServerUrl(saved.url).ok ? saved.url : null;
  return { envUrl, defaultUrl: savedUrl ?? envUrl, policy: saved.policy === "users" ? "users" : "locked", custom: savedUrl !== null };
}

/** `url: null` removes the saved address (back to JELLYFIN_URL). Omitted fields keep their value. */
export function saveServerConfig(patch: { url?: string | null; policy?: ServerPolicy }): ServerConfig {
  const row = db().select().from(instanceSettings).where(eq(instanceSettings.key, KEY)).get();
  let saved: { url?: string; policy?: ServerPolicy } = {};
  try {
    saved = row ? (JSON.parse(row.value) as typeof saved) : {};
  } catch {
    saved = {};
  }
  if (patch.url !== undefined) {
    if (patch.url === null) delete saved.url;
    else saved.url = patch.url;
  }
  if (patch.policy) saved.policy = patch.policy;
  const value = JSON.stringify(saved);
  const now = Date.now();
  db().insert(instanceSettings).values({ key: KEY, value, updatedAt: now }).onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedAt: now } }).run();
  return getServerConfig();
}

/** The server this account talks to. */
export function accountServerUrl(account?: Pick<Account, "serverUrl">): string {
  const cfg = getServerConfig();
  if (cfg.policy === "locked") return cfg.defaultUrl;
  return account?.serverUrl ?? cfg.defaultUrl;
}

/** The server the sign-in screen talks to: the one picked there (if users may pick), else the default. */
export async function loginServerUrl(): Promise<string> {
  const cfg = getServerConfig();
  if (cfg.policy === "locked") return cfg.defaultUrl;
  return (await readPendingServer())?.url ?? cfg.defaultUrl;
}

/** What to remember on a new account: nothing when it's just the default (so it follows the default). */
export function serverUrlToStore(url: string): string | undefined {
  const cfg = getServerConfig();
  return cfg.policy === "users" && url !== cfg.defaultUrl ? url : undefined;
}

/* ---------- validating an address ---------- */

/**
 * Cleans up what a person typed ("192.168.1.5:8096", "https://jf.example.com/")
 * into a base URL without a trailing slash, or explains what's wrong.
 * Refuses link-local addresses (cloud metadata services live there).
 */
export function normalizeServerUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  let raw = input.trim();
  if (!raw) return { ok: false, error: "Enter the server address." };
  if (raw.length > 200) return { ok: false, error: "That address is too long." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like an address. Try something like http://192.168.1.10:8096." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "The address must start with http:// or https://." };
  if (u.username || u.password) return { ok: false, error: "Leave the username and password out of the address." };
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, error: "Enter the server address." };
  if (host.startsWith("169.254.") || host.startsWith("[fe80:") || host === "metadata.google.internal" || host === "0.0.0.0") {
    return { ok: false, error: "That address isn't allowed." };
  }
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

export interface VerifiedServer {
  name: string;
  version: string;
  id: string;
}

const MAX_INFO_BYTES = 64 * 1024;

/**
 * Asks the address for Jellyfin's public info and only accepts a reply that
 * looks like a real Jellyfin server. (Jelly Shark's server makes this request,
 * so nothing else gets to answer for it: no redirects, short timeout, small
 * response, and the reply must have Jellyfin's shape.)
 */
export async function verifyJellyfin(url: string): Promise<{ ok: true; server: VerifiedServer } | { ok: false; error: string }> {
  const notJellyfin = { ok: false as const, error: "That address answered, but it doesn't look like a Jellyfin server." };
  try {
    const res = await fetch(`${url}/System/Info/Public`, {
      headers: { accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return res.status >= 300 && res.status < 400 ? notJellyfin : { ok: false, error: `The server answered with an error (${res.status}).` };
    const reader = res.body?.getReader();
    if (!reader) return notJellyfin;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_INFO_BYTES) {
        await reader.cancel();
        return notJellyfin;
      }
      chunks.push(value);
    }
    const info = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as Record<string, unknown>;
    const product = typeof info.ProductName === "string" ? info.ProductName : "Jellyfin";
    if (typeof info.Id !== "string" || typeof info.Version !== "string" || !/jellyfin/i.test(product)) return notJellyfin;
    return { ok: true, server: { id: info.Id, version: info.Version, name: typeof info.ServerName === "string" && info.ServerName ? info.ServerName : "Jellyfin" } };
  } catch (err) {
    if (err instanceof SyntaxError) return notJellyfin;
    return { ok: false, error: "Couldn't reach that address. Check it, and that Jellyfin is running." };
  }
}
