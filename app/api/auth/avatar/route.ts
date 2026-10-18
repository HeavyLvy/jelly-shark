import type { NextRequest } from "next/server";
import { loginServerUrl } from "@/lib/server-url";
import { jsonError } from "@/lib/http";

const GUID_RE = /^[0-9a-f]{32}$|^[0-9a-f-]{36}$/i;
const TAG_RE = /^[0-9a-z]{1,64}$/i;

/**
 * Anonymous user-avatar passthrough for the login page (Jellyfin serves
 * `/UserImage` without auth). Only this one endpoint, only these params.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  if (!GUID_RE.test(userId) || (tag && !TAG_RE.test(tag))) return jsonError(400, "bad_params");

  // Jellyfin 12.2's /UserImage only accepts userId, tag and format.
  const qs = new URLSearchParams({ userId });
  if (tag) qs.set("tag", tag);

  try {
    const upstream = await fetch(`${await loginServerUrl()}/UserImage?${qs}`, {
      headers: { "accept-encoding": "identity" },
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
    }
    const headers = new Headers({ "x-content-type-options": "nosniff", "cache-control": "private, max-age=86400" });
    const ct = upstream.headers.get("content-type");
    if (ct?.startsWith("image/")) headers.set("content-type", ct);
    else return new Response(null, { status: 502 });
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
