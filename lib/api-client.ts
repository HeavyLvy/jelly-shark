/** Typed fetch helper for our own /api/auth/* routes (browser-side). */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchInit {
  method?: "GET" | "POST";
  json?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(url: string, { method = "GET", json, signal }: ApiFetchInit = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: json === undefined ? undefined : { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, body.error ?? "error", body.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/**
 * Full document navigation, used deliberately after identity changes
 * (login, profile switch, logout, revoked token). Pages kept alive by
 * <Activity>, the query cache and client stores all hold per-user state,
 * and a fresh document is the only way to guarantee none of it leaks
 * across accounts. Use router.push() for ordinary navigation.
 */
export function hardNavigate(path: string): void {
  // The music queue is persisted in localStorage, which isn't per-user.
  try {
    window.localStorage.removeItem("jelly-shark-player");
  } catch {
    // storage unavailable (private mode) — nothing to clear
  }
  window.location.assign(path);
}

/** Sends the browser to the login page, preserving where the user was. */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = window.location.pathname + window.location.search;
  hardNavigate(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
