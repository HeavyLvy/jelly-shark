import type { NextRequest } from "next/server";
import { JF_PROXY_PREFIX, SESSION_COOKIE } from "@/lib/constants";
import { accountServerUrl } from "@/lib/server-url";
import { isSameOrigin, jsonError } from "@/lib/http";
import { buildAuthHeader, deviceNameFromUserAgent } from "@/lib/jellyfin/auth-header";
import {
  isJsonContentType,
  isPlaylistContentType,
  scrubJson,
  scrubPlaylist,
  stripApiKeyParams,
  type ScrubContext,
} from "@/lib/jellyfin/scrub";
import { activeAccount, unsealSession } from "@/lib/session";

/**
 * Backend-for-frontend proxy: /api/jf/<jellyfin path> → JELLYFIN_URL/<path>.
 *
 * - Attaches the signed-in user's token server-side (never exposed to JS).
 * - Streams media/image bodies unbuffered and passes Range/206 through.
 * - Buffers + scrubs JSON and HLS playlists so embedded ApiKey tokens are removed.
 */

const MAX_REQUEST_BODY = 5 * 1024 * 1024;
/** Cap on JSON/playlist/text bodies we buffer for scrubbing. */
const MAX_BUFFERED_BODY = 32 * 1024 * 1024;

/** Paths handled by /api/auth or out of scope (admin/bootstrap). Lowercase prefixes. */
const BLOCKED_PREFIXES = [
  "/users/authenticatebyname",
  "/users/authenticatewithquickconnect",
  "/users/new",
  "/users/forgotpassword",
  "/quickconnect",
  "/auth",
  "/devices",
  "/startup",
  "/sessions/logout",
  "/system/restart",
  "/system/shutdown",
  "/system/configuration",
  "/system/logs",
  "/system/activitylog",
  "/plugins",
  "/packages",
  "/repositories",
  "/scheduledtasks",
  "/backup",
  "/environment",
  "/library/virtualfolders",
  "/socket",
];

const FORWARD_REQUEST_HEADERS = ["range", "if-range", "if-none-match", "if-modified-since", "accept", "content-type", "accept-language"];

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
  "content-disposition",
  "expires",
];

/** Endpoints where Jellyfin tracks the transcode job by DeviceId / user. */
const DEVICE_SCOPED = /^\/(?:items\/[^/]+\/playbackinfo|videos\/[^/]+\/(?:stream|master\.m3u8|main\.m3u8)|audio\/[^/]+\/(?:stream|universal|master\.m3u8|main\.m3u8))/i;
const USER_SCOPED = /^\/(?:items\/[^/]+\/playbackinfo|audio\/[^/]+\/universal)/i;

function isBlocked(lowerPath: string): boolean {
  return BLOCKED_PREFIXES.some(
    (p) => lowerPath === p || lowerPath.startsWith(p + "/") || lowerPath.startsWith(p + "?"),
  );
}

/**
 * Decodes each path segment once — exactly what Kestrel does before
 * routing — so the blocklist sees the route Jellyfin will actually run
 * (e.g. `/Syst%65m/Restart` → `/System/Restart`). Rejects traversal,
 * encoded separators, empty segments and control characters.
 */
function decodePath(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  const segments = raw.slice(1).split("/");
  const decoded: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "" && i !== segments.length - 1) return null;
    let d: string;
    try {
      d = decodeURIComponent(seg);
    } catch {
      return null;
    }
    if (d === "." || d === ".." || /[/\\\u0000-\u001f\u007f]/.test(d)) return null;
    decoded.push(d);
  }
  return `/${decoded.join("/")}`;
}

/** Drops client-supplied credentials / identity params and injects server-side ones. */
function buildQuery(rawSearch: string, path: string, deviceId: string, userId: string): string {
  const pairs = rawSearch.replace(/^\?/, "").split("&").filter(Boolean);
  const kept = pairs.filter((pair) => {
    const rawKey = pair.split("=")[0];
    let key: string;
    try {
      key = decodeURIComponent(rawKey).toLowerCase();
    } catch {
      return false;
    }
    if (key === "apikey" || key === "api_key") return false;
    if (key === "deviceid" && DEVICE_SCOPED.test(path)) return false;
    if (key === "userid" && USER_SCOPED.test(path)) return false;
    return true;
  });
  if (DEVICE_SCOPED.test(path)) kept.push(`deviceId=${encodeURIComponent(deviceId)}`);
  if (USER_SCOPED.test(path)) kept.push(`userId=${encodeURIComponent(userId)}`);
  return kept.length ? `?${kept.join("&")}` : "";
}

/** Types safe to render when a proxied URL is opened directly. Everything else downloads. */
const INLINE_TYPES =
  /^(?:image\/(?:png|jpeg|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon)|audio\/|video\/|font\/|text\/(?:vtt|plain)|application\/(?:octet-stream|json|mp4|x-subrip|vnd\.apple\.mpegurl|x-mpegurl))/i;

/**
 * Proxied responses never run as documents on our origin: library files,
 * MKV attachments or plugin pages can be HTML/SVG. Subresource use
 * (<img>, <video>, fetch) is unaffected by a response's own CSP.
 */
const SANDBOX_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

function copyResponseHeaders(upstream: Headers, includeLength: boolean): Headers {
  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value) out.set(name, value);
  }
  // Responses are per-user (cookie-authenticated): never let shared caches store them.
  const cc = out.get("cache-control");
  if (cc) out.set("cache-control", cc.replace(/\bpublic\b/gi, "private"));
  if (includeLength && !upstream.get("content-encoding")) {
    const len = upstream.get("content-length");
    if (len) out.set("content-length", len);
  }
  out.set("x-content-type-options", "nosniff");
  out.set("content-security-policy", SANDBOX_CSP);
  const type = out.get("content-type");
  if (type && !INLINE_TYPES.test(type)) out.set("content-disposition", "attachment");
  return out;
}

/** Text types we buffer and scrub (besides JSON and playlists): error bodies can echo URLs. */
function isScrubbedText(contentType: string | null): boolean {
  return !!contentType && /^text\/(?:plain|html|xml)|^application\/xml/i.test(contentType);
}

/** Reads a body as text up to `max` bytes; returns null when it is larger. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > max) {
    await res.body?.cancel();
    return null;
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function handle(req: NextRequest): Promise<Response> {
  const method = req.method.toUpperCase();

  if ((method === "POST" || method === "DELETE") && !isSameOrigin(req)) {
    return jsonError(403, "cross_origin");
  }

  const session = await unsealSession(req.cookies.get(SESSION_COOKIE)?.value);
  const account = session ? activeAccount(session) : undefined;
  if (!account) return jsonError(401, "unauthenticated");

  const { deviceId } = account;

  // Forward the path as received (Jellyfin decodes it the same way), but
  // validate the decoded form.
  const path = req.nextUrl.pathname.slice(JF_PROXY_PREFIX.length) || "/";
  const decodedPath = decodePath(path);
  if (decodedPath === null) return jsonError(400, "bad_path");
  if (isBlocked(decodedPath.toLowerCase())) return jsonError(403, "blocked_path");

  const base = accountServerUrl(account);
  const upstreamUrl = `${base}${path}${buildQuery(req.nextUrl.search, decodedPath, deviceId, account.userId)}`;
  const baseUrl = new URL(base);
  if (new URL(upstreamUrl).origin !== baseUrl.origin) return jsonError(400, "bad_path");

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set(
    "authorization",
    buildAuthHeader({ deviceId, deviceName: deviceNameFromUserAgent(req.headers.get("user-agent")) }, account.token),
  );
  // Avoid upstream compression so Content-Length stays truthful for streamed bodies.
  headers.set("accept-encoding", "identity");

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BODY) return jsonError(413, "body_too_large");
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BODY) return jsonError(413, "body_too_large");
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("[jf-proxy] upstream fetch failed", path, err);
    return jsonError(502, "upstream_unreachable");
  }

  const scrubCtx: ScrubContext = {
    token: account.token,
    upstreamOrigin: baseUrl.origin,
    upstreamBasePath: baseUrl.pathname.replace(/\/+$/, ""),
  };

  // Redirects: only follow ones that stay on Jellyfin, re-routed through the proxy.
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    await upstream.body?.cancel();
    if (!location) return jsonError(502, "bad_redirect");
    const resolved = new URL(location, upstreamUrl);
    if (resolved.origin !== baseUrl.origin) return jsonError(502, "external_redirect");
    let target = resolved.pathname + resolved.search;
    if (scrubCtx.upstreamBasePath && target.startsWith(scrubCtx.upstreamBasePath + "/")) {
      target = target.slice(scrubCtx.upstreamBasePath.length);
    }
    return new Response(null, {
      status: upstream.status,
      headers: { location: JF_PROXY_PREFIX + stripApiKeyParams(target) },
    });
  }

  if (upstream.status === 401) {
    await upstream.body?.cancel();
    return jsonError(401, "token_rejected");
  }

  const contentType = upstream.headers.get("content-type");

  if (
    method !== "HEAD" &&
    (isJsonContentType(contentType) || isPlaylistContentType(contentType) || isScrubbedText(contentType))
  ) {
    const text = await readCapped(upstream, MAX_BUFFERED_BODY);
    if (text === null) return jsonError(502, "upstream_body_too_large");
    let out: string;
    if (isPlaylistContentType(contentType)) {
      out = scrubPlaylist(text, scrubCtx);
    } else if (text.length === 0) {
      out = text;
    } else if (!isJsonContentType(contentType)) {
      out = stripApiKeyParams(text.split(account.token).join(""));
    } else {
      try {
        out = JSON.stringify(scrubJson(JSON.parse(text), scrubCtx));
      } catch {
        out = stripApiKeyParams(text.split(account.token).join(""));
      }
    }
    return new Response(out, {
      status: upstream.status,
      headers: copyResponseHeaders(upstream.headers, false),
    });
  }

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: copyResponseHeaders(upstream.headers, true),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function HEAD(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}
