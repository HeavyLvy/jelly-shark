import "server-only";
import type { SeerrConfig } from "./config";

const MAX_BODY = 4 * 1024 * 1024;

export interface SeerrReply {
  status: number;
  data: unknown;
}

/**
 * One call to Seerr's API with the saved admin key. `asUser` is a Seerr user id:
 * Seerr then treats the call as that person (their permissions, quota and name
 * on the request). No redirects, a time limit and a size limit, since this
 * server makes the request. Throws only when Seerr can't be reached.
 */
export async function seerrCall(config: SeerrConfig, path: string, opts: { method?: "GET" | "POST" | "DELETE"; body?: unknown; asUser?: number } = {}): Promise<SeerrReply> {
  const headers: Record<string, string> = { accept: "application/json", "x-api-key": config.apiKey };
  if (opts.asUser !== undefined) headers["x-api-user"] = String(opts.asUser);
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${config.url}/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) {
    await res.body?.cancel();
    return { status: 502, data: null };
  }
  const text = await res.text();
  if (text.length > MAX_BODY) return { status: 502, data: null };
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON: leave null
  }
  return { status: res.status, data };
}

/** The human message Seerr put in an error reply, trimmed. */
export function seerrMessage(data: unknown): string | null {
  const m = typeof data === "object" && data !== null ? (data as { message?: unknown }).message : null;
  return typeof m === "string" && m.trim() ? m.trim().slice(0, 200) : null;
}
