import "server-only";
import { getAuthorizationHeader } from "@jellyfin/sdk/lib/utils/authentication";
import { CLIENT_NAME, CLIENT_VERSION } from "@/lib/constants";

export interface UpstreamIdentity {
  deviceId: string;
  deviceName: string;
}

/** Jellyfin `Authorization: MediaBrowser ...` header, built by the official SDK. */
export function buildAuthHeader({ deviceId, deviceName }: UpstreamIdentity, token = ""): string {
  return getAuthorizationHeader(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { name: deviceName, id: deviceId },
    token,
  );
}

/** Derives a human-friendly device name ("Firefox on Linux") from a User-Agent. */
export function deviceNameFromUserAgent(ua: string | null): string {
  if (!ua) return "Web Browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}
