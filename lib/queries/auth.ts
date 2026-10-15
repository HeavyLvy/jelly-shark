"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError, redirectToLogin } from "@/lib/api-client";
import { useIsClient } from "@/lib/use-is-client";
import { hydrationSafe } from "./use-jf-query";

export interface PublicAccount {
  userId: string;
  name: string;
  primaryImageTag: string | null;
}

export interface Me {
  user: { id: string; name: string; primaryImageTag: string | null; isAdministrator: boolean };
  accounts: PublicAccount[];
}

export interface ServerInfo {
  serverName: string;
  version: string | null;
  quickConnect: boolean;
  publicUsers: (PublicAccount & { hasPassword: boolean })[];
  accounts: PublicAccount[];
  activeUserId: string | null;
}

export const authKeys = {
  me: ["auth", "me"] as const,
  server: ["auth", "server"] as const,
};

export function useMe() {
  const isClient = useIsClient();
  const result = useQuery({
    queryKey: authKeys.me,
    enabled: isClient,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<Me>("/api/auth/me", { signal });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) redirectToLogin();
        throw err;
      }
    },
  });
  return hydrationSafe(result, isClient);
}

export function useServerInfo() {
  const isClient = useIsClient();
  const result = useQuery({
    queryKey: authKeys.server,
    enabled: isClient,
    queryFn: ({ signal }) => apiFetch<ServerInfo>("/api/auth/server", { signal }),
  });
  return hydrationSafe(result, isClient);
}

/** After any identity change, drop every cached query (they are per-user). */
function useResetAfterAuthChange() {
  const qc = useQueryClient();
  return () => qc.clear();
}

export function useLogin() {
  const reset = useResetAfterAuthChange();
  return useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      apiFetch<{ account: PublicAccount }>("/api/auth/login", { method: "POST", json: vars }),
    onSuccess: reset,
  });
}

export function useSwitchAccount() {
  const reset = useResetAfterAuthChange();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ account: PublicAccount }>("/api/auth/switch", { method: "POST", json: { userId } }),
    onSuccess: reset,
  });
}

export function useLogout() {
  const reset = useResetAfterAuthChange();
  return useMutation({
    mutationFn: (userId?: string) =>
      apiFetch<{ remaining: number }>("/api/auth/logout", { method: "POST", json: userId ? { userId } : {} }),
    onSuccess: reset,
  });
}

export type QuickConnectStatus = "pending" | "authenticated" | "expired";

export function useQuickConnectInitiate() {
  return useMutation({
    mutationFn: () => apiFetch<{ code: string }>("/api/auth/quickconnect/initiate", { method: "POST" }),
  });
}

export function pollQuickConnect() {
  return apiFetch<{ status: QuickConnectStatus; account?: PublicAccount }>("/api/auth/quickconnect/poll", {
    method: "POST",
  });
}

export function avatarUrl(account: { userId: string; primaryImageTag: string | null }): string | null {
  if (!account.primaryImageTag) return null;
  return `/api/auth/avatar?userId=${encodeURIComponent(account.userId)}&tag=${encodeURIComponent(account.primaryImageTag)}`;
}
