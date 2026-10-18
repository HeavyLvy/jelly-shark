import { NextResponse } from "next/server";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getAuthenticationApi } from "@jellyfin/sdk/lib/utils/api/authentication-api";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { jsonError } from "@/lib/http";
import { serverApi } from "@/lib/jellyfin/server";
import { getServerConfig, loginServerUrl } from "@/lib/server-url";
import { readSession, toPublicAccount } from "@/lib/session";

/** Unauthenticated info for the login page: server name, public users, Quick Connect, remembered accounts. */
export async function GET() {
  const cfg = getServerConfig();
  const serverUrl = await loginServerUrl();
  const api = await serverApi({ serverUrl });
  const canChangeServer = cfg.policy === "users";
  try {
    const [info, publicUsers, quickConnect, session] = await Promise.all([
      getSystemApi(api).getPublicSystemInfo().then((r) => r.data),
      getUserApi(api)
        .getPublicUsers()
        .then((r) => r.data)
        .catch((): UserDto[] => []),
      getAuthenticationApi(api)
        .getQuickConnectEnabled()
        .then((r) => r.data)
        .catch(() => false),
      readSession(),
    ]);
    return NextResponse.json(
      {
        serverName: info.ServerName ?? "Jellyfin",
        version: info.Version ?? null,
        quickConnect,
        publicUsers: publicUsers
          .filter((u): u is UserDto & { Id: string } => typeof u.Id === "string")
          .map((u) => ({
            userId: u.Id,
            name: u.Name ?? "User",
            primaryImageTag: u.PrimaryImageTag ?? null,
            hasPassword: u.HasPassword ?? true,
          })),
        // Only when people may pick their own server do they get to see or change the address.
        canChangeServer,
        serverUrl: canChangeServer ? serverUrl : null,
        usingDefault: serverUrl === cfg.defaultUrl,
        accounts: session?.accounts.map(toPublicAccount) ?? [],
        activeUserId: session?.activeUserId ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(502, "upstream_unreachable", { message: "Can't reach the Jellyfin server." });
  }
}
