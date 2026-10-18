import { NextResponse } from "next/server";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { jsonError } from "@/lib/http";
import { serverApi, upstreamStatus } from "@/lib/jellyfin/server";
import { accountServerUrl, getServerConfig } from "@/lib/server-url";
import {
  activeAccount,
  readSession,
  removeAccount,
  toPublicAccount,
  writeSession,
} from "@/lib/session";

/**
 * Returns the active user plus the other remembered accounts. Validates the
 * active token against Jellyfin and drops it from the cookie if revoked.
 */
export async function GET() {
  const session = await readSession();
  const account = session ? activeAccount(session) : undefined;
  if (!session || !account) return jsonError(401, "unauthenticated");

  const serverUrl = accountServerUrl(account);
  let user;
  let serverName: string | null = null;
  try {
    const api = await serverApi({ serverUrl, token: account.token, deviceId: account.deviceId });
    ({ data: user } = await getUserApi(api).getCurrentUser());
    // Best effort: a missing name must never break loading the signed-in user.
    serverName = await getSystemApi(api).getPublicSystemInfo().then((r) => r.data.ServerName ?? null).catch(() => null);
  } catch (err) {
    const status = upstreamStatus(err);
    if (status === 401) {
      const next = removeAccount(session, account.userId);
      await writeSession(next);
      return jsonError(401, "token_rejected", { remaining: next?.accounts.length ?? 0 });
    }
    return jsonError(502, status === undefined ? "upstream_unreachable" : "upstream_error");
  }

  const refreshed = {
    ...account,
    name: user.Name ?? account.name,
    primaryImageTag: user.PrimaryImageTag ?? null,
  };
  if (refreshed.name !== account.name || refreshed.primaryImageTag !== account.primaryImageTag) {
    await writeSession({
      ...session,
      accounts: session.accounts.map((a) => (a.userId === account.userId ? refreshed : a)),
    });
  }

  return NextResponse.json(
    {
      user: {
        id: refreshed.userId,
        name: refreshed.name,
        primaryImageTag: refreshed.primaryImageTag,
        isAdministrator: user.Policy?.IsAdministrator ?? false,
      },
      accounts: session.accounts.map((a) => toPublicAccount(a.userId === refreshed.userId ? refreshed : a)),
      // Which server this profile is on. The address itself is only shared when people may pick their own.
      server: {
        name: serverName,
        canChange: getServerConfig().policy === "users",
        isInstanceServer: serverUrl === getServerConfig().defaultUrl,
        url: getServerConfig().policy === "users" ? serverUrl : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
