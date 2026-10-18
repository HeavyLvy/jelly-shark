import "server-only";
import axios, { AxiosError } from "axios";
import { headers } from "next/headers";
import { Api } from "@jellyfin/sdk/lib/api";
import { CLIENT_NAME, CLIENT_VERSION } from "@/lib/constants";
import { getOrCreateDeviceId } from "@/lib/session";
import { deviceNameFromUserAgent, type UpstreamIdentity } from "./auth-header";

/**
 * Server-side Jellyfin client: the official OpenAPI-generated SDK pointed
 * straight at a Jellyfin server (the caller says which; see lib/server-url.ts),
 * with this browser's DeviceId. Use it with the
 * SDK's helpers, e.g. `getAuthenticationApi(api).authenticateUserByName(...)`.
 */

const http = axios.create({ timeout: 15_000, maxRedirects: 0 });

export function createServerApi(serverUrl: string, identity: UpstreamIdentity, token = ""): Api {
  return new Api(
    serverUrl,
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { name: identity.deviceName, id: identity.deviceId },
    token,
    http,
  );
}

/** This browser's stable id (jf_device). Per-account DeviceIds derive from it. */
export const browserDeviceId = getOrCreateDeviceId;

/**
 * SDK instance for the current request. `deviceId` defaults to the browser
 * id (fine for anonymous calls); authenticated calls pass the account's own.
 */
export async function serverApi({ serverUrl, token, deviceId }: { serverUrl: string; token?: string; deviceId?: string }): Promise<Api> {
  const [id, h] = await Promise.all([deviceId ?? getOrCreateDeviceId(), headers()]);
  return createServerApi(serverUrl, { deviceId: id, deviceName: deviceNameFromUserAgent(h.get("user-agent")) }, token);
}

/** HTTP status from a failed SDK call, or undefined if Jellyfin was unreachable. */
export function upstreamStatus(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined;
}
