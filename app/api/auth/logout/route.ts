import { NextResponse } from "next/server";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { serverApi } from "@/lib/jellyfin/server";
import { activeAccount, readSession, removeAccount, writeSession } from "@/lib/session";

/** Signs out one account (the active one by default) and revokes its Jellyfin token. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");

  const body = await readJsonBody<{ userId?: unknown }>(req);
  const session = await readSession();
  if (!session) return NextResponse.json({ remaining: 0 });

  const target =
    typeof body?.userId === "string"
      ? session.accounts.find((a) => a.userId === body.userId)
      : activeAccount(session);
  if (!target) return jsonError(404, "unknown_account");

  try {
    await getSessionApi(await serverApi({ token: target.token, deviceId: target.deviceId })).reportSessionEnded({
      timeout: 5_000,
    });
  } catch {
    // Best effort: the cookie entry is removed regardless.
  }

  const next = removeAccount(session, target.userId);
  await writeSession(next);
  return NextResponse.json({ remaining: next?.accounts.length ?? 0 });
}
