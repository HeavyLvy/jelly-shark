import { NextResponse } from "next/server";
import { getAuthenticationApi } from "@jellyfin/sdk/lib/utils/api/authentication-api";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { serverApi, upstreamStatus } from "@/lib/jellyfin/server";
import { accountServerUrl } from "@/lib/server-url";
import { rateLimited } from "@/lib/rate-limit";
import { activeAccount, readSession } from "@/lib/session";

/**
 * Approve another device's Quick Connect request with the signed-in user's own
 * account: the person types the 6-digit code shown on the other device (a
 * Jellyfin app, or another Jelly Shark login screen). The device then signs in
 * as this user. Jellyfin does the real work; this just forwards the code with
 * the user's token (which never reaches the browser).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const session = await readSession();
  const account = session ? activeAccount(session) : undefined;
  if (!account) return jsonError(401, "unauthenticated");

  const body = await readJsonBody<{ code?: unknown }>(req);
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return jsonError(400, "invalid_code", { message: "Enter the 6-digit code." });

  // Codes are short, so slow down guessing: 10 tries a minute per user.
  if (rateLimited(`qc:${account.userId}`, 10, 60_000)) return jsonError(429, "too_many_attempts", { message: "Too many tries. Wait a minute and try again." });

  try {
    const { data: ok } = await getAuthenticationApi(await serverApi({ serverUrl: accountServerUrl(account), token: account.token, deviceId: account.deviceId })).authorizeQuickConnect({ code });
    if (!ok) return jsonError(404, "invalid_code", { message: "That code isn't valid or has expired." });
    return NextResponse.json({ ok: true, name: account.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const status = upstreamStatus(err);
    if (status === 404 || status === 400) return jsonError(404, "invalid_code", { message: "That code isn't valid or has expired." });
    if (status === 401 || status === 403) return jsonError(403, "quick_connect_disabled", { message: "Quick Connect is turned off on this Jellyfin server." });
    return jsonError(502, status === undefined ? "upstream_unreachable" : "upstream_error", { message: "Couldn't reach Jellyfin." });
  }
}
