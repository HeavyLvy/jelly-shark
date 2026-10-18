import "server-only";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { jsonError } from "@/lib/http";
import { serverApi } from "@/lib/jellyfin/server";
import { activeAccount, readSession } from "@/lib/session";

/**
 * Only Jellyfin administrators may change instance-wide settings. Asks
 * Jellyfin (with the caller's own token) rather than trusting the browser.
 * Returns an error Response to send back, or null when allowed.
 */
export async function requireAdmin(): Promise<Response | null> {
  const session = await readSession();
  const account = session ? activeAccount(session) : undefined;
  if (!account) return jsonError(401, "unauthenticated");
  try {
    const { data: user } = await getUserApi(await serverApi({ token: account.token, deviceId: account.deviceId })).getCurrentUser();
    if (!user.Policy?.IsAdministrator) return jsonError(403, "admin_only");
    return null;
  } catch {
    return jsonError(502, "upstream_unreachable");
  }
}
