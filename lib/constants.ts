/** Cookie and client identity constants shared by proxy.ts and route handlers. */

export const SESSION_COOKIE = "jf_session";
export const DEVICE_COOKIE = "jf_device";
export const QUICK_CONNECT_COOKIE = "jf_qc";

export const CLIENT_NAME = "Jelly Shark";
export const CLIENT_VERSION = "0.1.0";

/** Browsers cap cookie lifetime at 400 days. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
/** Jellyfin drops pending Quick Connect requests after 10 minutes. */
export const QUICK_CONNECT_MAX_AGE = 60 * 10;

export const JF_PROXY_PREFIX = "/api/jf";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
