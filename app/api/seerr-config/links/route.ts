import { NextResponse } from "next/server";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { requireAdmin } from "@/lib/admin";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { serverApi } from "@/lib/jellyfin/server";
import { getSeerrConfig } from "@/lib/seerr/config";
import type { LinkRow } from "@/lib/seerr/types";
import { getOverrides, listSeerrUsers, normalizeJellyfinId, setOverride } from "@/lib/seerr/link";
import { accountServerUrl } from "@/lib/server-url";
import { activeAccount, readSession } from "@/lib/session";

const noStore = { "Cache-Control": "no-store" };

/**
 * Who acts as which Seerr account (Jellyfin administrators only):
 * every Jellyfin user with the Seerr account they're linked to, and the Seerr
 * accounts to choose from.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const config = getSeerrConfig();
  if (!config) return jsonError(404, "not_configured");
  const session = await readSession();
  const account = session ? activeAccount(session) : undefined;
  if (!account) return jsonError(401, "unauthenticated");

  try {
    const api = await serverApi({ serverUrl: accountServerUrl(account), token: account.token, deviceId: account.deviceId });
    const [{ data: jfUsers }, seerrUsers] = await Promise.all([getUserApi(api).getUsers(), listSeerrUsers(config)]);
    const overrides = getOverrides();
    const rows: LinkRow[] = jfUsers
      .filter((u) => u.Id)
      .map((u): LinkRow => {
        const id = u.Id as string;
        const key = normalizeJellyfinId(id);
        const matched = seerrUsers.find((s) => s.jellyfinUserId && normalizeJellyfinId(s.jellyfinUserId) === key);
        const manual = overrides[key];
        return { jellyfinUserId: id, jellyfinName: u.Name ?? "Unknown", seerrUserId: manual ?? matched?.id ?? null, source: manual ? "manual" : matched ? "auto" : "none" };
      })
      .sort((a, b) => a.jellyfinName.localeCompare(b.jellyfinName));
    return NextResponse.json({ links: rows, seerrUsers: seerrUsers.map((s) => ({ id: s.id, name: s.name })) }, { headers: noStore });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}

/** Pin a Jellyfin user to a Seerr account, or (`seerrUserId: null`) go back to automatic. Body: `{ jellyfinUserId, seerrUserId }`. */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  const config = getSeerrConfig();
  if (!config) return jsonError(404, "not_configured");
  const body = await readJsonBody<{ jellyfinUserId?: unknown; seerrUserId?: unknown }>(req);
  if (!body || typeof body.jellyfinUserId !== "string" || !/^[0-9a-f-]{32,36}$/i.test(body.jellyfinUserId)) return jsonError(400, "invalid_body");
  const seerrUserId = body.seerrUserId;
  if (seerrUserId !== null && (typeof seerrUserId !== "number" || !Number.isInteger(seerrUserId) || seerrUserId <= 0)) return jsonError(400, "invalid_body");
  if (seerrUserId !== null) {
    // Only an account Seerr really has.
    const users = await listSeerrUsers(config);
    if (!users.some((u) => u.id === seerrUserId)) return jsonError(400, "unknown_seerr_user", { message: "Seerr has no such account." });
  }
  setOverride(body.jellyfinUserId, seerrUserId);
  return new NextResponse(null, { status: 204 });
}
