import { NextResponse } from "next/server";
import { getAuthenticationApi } from "@jellyfin/sdk/lib/utils/api/authentication-api";
import { isSameOrigin, jsonError } from "@/lib/http";
import { quickConnectDeviceId } from "@/lib/jellyfin/device";
import { browserDeviceId, serverApi, upstreamStatus } from "@/lib/jellyfin/server";
import { loginServerUrl } from "@/lib/server-url";
import { writeQuickConnect } from "@/lib/session";

/**
 * Starts Quick Connect. The token Jellyfin later issues is bound to the
 * DeviceId sent here, so it is sealed alongside the secret. Only the short
 * code is returned to the browser.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");

  try {
    const deviceId = quickConnectDeviceId(await browserDeviceId());
    const serverUrl = await loginServerUrl();
    const { data } = await getAuthenticationApi(await serverApi({ serverUrl, deviceId })).initiateQuickConnect();
    if (!data.Secret || !data.Code) return jsonError(502, "upstream_error");
    await writeQuickConnect({ secret: data.Secret, deviceId, serverUrl });
    return NextResponse.json({ code: data.Code });
  } catch (err) {
    const status = upstreamStatus(err);
    if (status === 401 || status === 403) {
      return jsonError(403, "quick_connect_disabled", { message: "Quick Connect is disabled on this server." });
    }
    return jsonError(502, status === undefined ? "upstream_unreachable" : "upstream_error", {
      message: "Can't start Quick Connect.",
    });
  }
}
