import { NextResponse } from "next/server";
import { getAuthenticationApi } from "@jellyfin/sdk/lib/utils/api/authentication-api";
import { persistAuthentication } from "@/lib/auth-shared";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { passwordLoginDeviceId } from "@/lib/jellyfin/device";
import { browserDeviceId, serverApi, upstreamStatus } from "@/lib/jellyfin/server";
import { loginServerUrl } from "@/lib/server-url";
import { toPublicAccount } from "@/lib/session";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");

  const body = await readJsonBody<LoginBody>(req);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username) return jsonError(400, "missing_username", { message: "Enter a username." });

  try {
    const deviceId = passwordLoginDeviceId(await browserDeviceId(), username);
    const serverUrl = await loginServerUrl();
    const { data } = await getAuthenticationApi(await serverApi({ serverUrl, deviceId })).authenticateUserByName({
      authenticateUserByName: { Username: username, Pw: password },
    });
    const account = await persistAuthentication(data, deviceId, serverUrl);
    return NextResponse.json({ account: toPublicAccount(account) });
  } catch (err) {
    const status = upstreamStatus(err);
    if (status === 401 || status === 403) {
      return jsonError(401, "invalid_credentials", { message: "Wrong username or password." });
    }
    if (status === undefined) {
      return jsonError(502, "upstream_unreachable", { message: "Can't reach the Jellyfin server." });
    }
    return jsonError(502, "upstream_error", { message: `Jellyfin returned ${status}.` });
  }
}
