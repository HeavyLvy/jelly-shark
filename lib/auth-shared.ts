import "server-only";
import type { AuthenticationResult } from "@jellyfin/sdk/lib/generated-client/models";
import { readSession, upsertAccount, writeSession, type Account } from "@/lib/session";

/** Stores a successful Jellyfin authentication as the active account. */
export async function persistAuthentication(result: AuthenticationResult, deviceId: string): Promise<Account> {
  const user = result.User;
  if (!result.AccessToken || !user?.Id) {
    throw new Error("Jellyfin returned an incomplete authentication result.");
  }
  const account: Account = {
    userId: user.Id,
    name: user.Name ?? "User",
    token: result.AccessToken,
    primaryImageTag: user.PrimaryImageTag ?? null,
    deviceId,
  };
  const session = await readSession();
  await writeSession(upsertAccount(session, account));
  return account;
}
