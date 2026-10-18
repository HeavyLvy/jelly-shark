import { NextResponse } from "next/server";
import { getAuthenticationApi } from "@jellyfin/sdk/lib/utils/api/authentication-api";
import { persistAuthentication } from "@/lib/auth-shared";
import { isSameOrigin, jsonError } from "@/lib/http";
import { serverApi, upstreamStatus } from "@/lib/jellyfin/server";
import { readQuickConnect, toPublicAccount, writeQuickConnect } from "@/lib/session";

/** Polls Quick Connect; on approval, completes login server-side. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");

  const pending = await readQuickConnect();
  if (!pending) return NextResponse.json({ status: "expired" });
  const { secret, deviceId, serverUrl } = pending;

  const auth = getAuthenticationApi(await serverApi({ serverUrl, deviceId }));
  try {
    const { data: state } = await auth.getQuickConnectState({ secret });
    if (!state.Authenticated) return NextResponse.json({ status: "pending" });

    const { data } = await auth.authenticateWithQuickConnect({ quickConnectDto: { Secret: secret } });
    const account = await persistAuthentication(data, deviceId, serverUrl);
    await writeQuickConnect(null);
    return NextResponse.json({ status: "authenticated", account: toPublicAccount(account) });
  } catch (err) {
    const status = upstreamStatus(err);
    if (status === 404 || status === 401) {
      await writeQuickConnect(null);
      return NextResponse.json({ status: "expired" });
    }
    return jsonError(502, status === undefined ? "upstream_unreachable" : "upstream_error");
  }
}
