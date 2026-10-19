import "server-only";
import { JF_PROXY_PREFIX } from "@/lib/constants";

/**
 * Jellyfin 12 embeds `ApiKey=<token>` in URLs it generates (TranscodingUrl,
 * MediaStreams[].DeliveryUrl, MediaAttachments[].DeliveryUrl, and URI="..."
 * attributes in HLS master playlists). These helpers strip credentials and
 * point absolute Jellyfin paths back through our proxy so the token never
 * reaches the browser.
 */

export interface ScrubContext {
  /** The session token, removed verbatim anywhere it appears (backstop). */
  token: string | undefined;
  /** JELLYFIN_URL origin, e.g. `http://192.168.1.10:8096`. */
  upstreamOrigin: string;
  /** Path prefix of JELLYFIN_URL when Jellyfin runs under a base path (usually ""). */
  upstreamBasePath: string;
}

const API_KEY_PARAM = /([?&])(?:api_?key)=[^&#"'\s<>]*(&?)/gi;

/** Removes ApiKey/api_key query parameters, keeping the remaining query intact. */
export function stripApiKeyParams(text: string): string {
  return text.replace(API_KEY_PARAM, (_m, sep: string, trailingAmp: string) =>
    trailingAmp ? sep : "",
  );
}

/** Maps an absolute Jellyfin URL or root-relative server path to a proxy path. */
function toProxyPath(value: string, ctx: ScrubContext): string {
  let path: string | null = null;
  if (value.startsWith(ctx.upstreamOrigin + "/")) {
    path = value.slice(ctx.upstreamOrigin.length);
  } else if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith(JF_PROXY_PREFIX + "/")) {
    path = value;
  }
  if (path === null) return value;
  if (ctx.upstreamBasePath && path.startsWith(ctx.upstreamBasePath + "/")) {
    path = path.slice(ctx.upstreamBasePath.length);
  }
  return JF_PROXY_PREFIX + path;
}

function scrubString(value: string, key: string | null, ctx: ScrubContext): string {
  let out = value;
  if (ctx.token && out.includes(ctx.token)) out = out.split(ctx.token).join("");
  if (/api_?key=/i.test(out)) out = stripApiKeyParams(out);
  // Only rewrite URL-shaped fields so plain data (e.g. file Paths) is untouched.
  if (key !== null && /url$/i.test(key)) out = toProxyPath(out, ctx);
  else if (out.startsWith(ctx.upstreamOrigin + "/")) out = toProxyPath(out, ctx);
  return out;
}

/** Field names whose values are credentials and must never be forwarded. */
const SECRET_KEYS = new Set(["accesstoken", "secret", "apikey", "api_key", "token"]);

export function scrubJson(value: unknown, ctx: ScrubContext, key: string | null = null): unknown {
  if (typeof value === "string") return scrubString(value, key, ctx);
  if (Array.isArray(value)) return value.map((v) => scrubJson(v, ctx, null));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(k.toLowerCase()) && typeof v === "string") continue;
      out[k] = scrubJson(v, ctx, k);
    }
    return out;
  }
  return value;
}

/**
 * Rewrites an HLS playlist: strips credentials and maps absolute URIs (both
 * URI lines and URI="..." tag attributes) to proxy paths. Relative URIs
 * (e.g. `hls1/main/0.mp4`, `main.m3u8?...`) already resolve through the proxy.
 */
export function scrubPlaylist(text: string, ctx: ScrubContext): string {
  let out = text;
  if (ctx.token) out = out.split(ctx.token).join("");
  out = stripApiKeyParams(out);
  return out
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]*)"/g, (_m, uri: string) => `URI="${toProxyPath(uri, ctx)}"`);
      }
      return trimmed ? toProxyPath(trimmed, ctx) : line;
    })
    .join("\n");
}

const PLAYLIST_TYPES = ["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"];

export function isPlaylistContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return PLAYLIST_TYPES.some((t) => ct.startsWith(t));
}

export function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.startsWith("application/json") || ct.startsWith("text/json") || /\+json\b/.test(ct);
}
