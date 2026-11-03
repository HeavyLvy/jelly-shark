import "server-only";
import { jsonError } from "@/lib/http";
import { accountServerUrl, getServerConfig } from "@/lib/server-url";
import { activeAccount, readSession } from "@/lib/session";
import { getSeerrConfig, type SeerrConfig } from "./config";
import { resolveSeerrUser } from "./link";

export interface SeerrContext {
  config: SeerrConfig;
  /** The signed-in person's Jellyfin user id. */
  jellyfinUserId: string;
  /** The Seerr account they act as. */
  seerrUserId: number;
}

/**
 * Who is calling and which Seerr account they act as, or an error Response to
 * send back. Seerr belongs to the instance's own Jellyfin server, so someone
 * signed in to a different server (when users may choose) gets nothing.
 */
export async function requireSeerrUser(): Promise<SeerrContext | Response> {
  const base = await requireSignedIn();
  if (base instanceof Response) return base;
  const resolved = await resolveSeerrUser(base.config, base.jellyfinUserId);
  if (!resolved.ok) return resolved.error === "no_account" ? jsonError(403, "no_account", { message: "You don't have a Seerr account yet, and one couldn't be created. Ask an administrator." }) : jsonError(502, "upstream_unreachable");
  return { ...base, seerrUserId: resolved.seerrUserId };
}

/** The signed-in person, without looking up their Seerr account (cheap checks and images). */
export async function requireSignedIn(): Promise<{ config: SeerrConfig; jellyfinUserId: string } | Response> {
  const session = await readSession();
  const account = session ? activeAccount(session) : undefined;
  if (!account) return jsonError(401, "unauthenticated");
  if (accountServerUrl(account) !== getServerConfig().defaultUrl) return jsonError(404, "not_configured");
  const config = getSeerrConfig();
  if (!config) return jsonError(404, "not_configured");
  return { config, jellyfinUserId: account.userId };
}
