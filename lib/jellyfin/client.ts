import axios, { AxiosError } from "axios";
import { Api } from "@jellyfin/sdk/lib/api";
import { CLIENT_NAME, CLIENT_VERSION, JF_PROXY_PREFIX } from "@/lib/constants";
import { redirectToLogin } from "@/lib/api-client";

/**
 * Browser-side Jellyfin SDK instance. Requests go to our /api/jf proxy,
 * which replaces the SDK's (token-less) Authorization header with the real
 * one server-side. Use with tree-shakeable helpers, e.g.
 * `getLibraryApi(jf).getItems({...})`. Never use it to download streams —
 * build `/api/jf/...` URLs for media elements instead.
 */

const http = axios.create();

http.interceptors.response.use(undefined, (error: unknown) => {
  if (error instanceof AxiosError && error.response?.status === 401) {
    redirectToLogin();
  }
  return Promise.reject(error);
});

export const jf = new Api(
  JF_PROXY_PREFIX,
  { name: CLIENT_NAME, version: CLIENT_VERSION },
  // Placeholder identity: the proxy injects the real DeviceId and token.
  { name: "browser", id: "bff" },
  "",
  http,
);

/** Builds a proxied URL for a Jellyfin path (for <img>, <audio>, <video>, hls.js). */
export function jfUrl(path: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
  }
  const query = qs.toString();
  return `${JF_PROXY_PREFIX}${path.startsWith("/") ? path : `/${path}`}${query ? `?${query}` : ""}`;
}
