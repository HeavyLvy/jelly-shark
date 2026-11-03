import "server-only";

export interface VerifiedSeerr {
  version: string;
}

const MAX_BYTES = 256 * 1024;

/** Reads a JSON reply up to MAX_BYTES, or null when it is larger or isn't JSON. */
async function readSmallJson(res: Response): Promise<Record<string, unknown> | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One short request to Seerr's API. No redirects and a small reply, since Jelly Shark's server makes it. */
function call(url: string, path: string, apiKey?: string): Promise<Response> {
  return fetch(`${url}/api/v1${path}`, {
    headers: { accept: "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
}

/**
 * Checks an address and API key before they are saved: the address must answer
 * like Seerr, and the key must belong to an administrator (Jelly Shark acts
 * for people with it, so a limited key would fail later in confusing ways).
 */
export async function verifySeerr(url: string, apiKey: string): Promise<{ ok: true; seerr: VerifiedSeerr } | { ok: false; status: number; error: string; message: string }> {
  const notSeerr = { ok: false as const, status: 422, error: "not_seerr", message: "That address answered, but it doesn't look like Seerr." };
  try {
    const statusRes = await call(url, "/status");
    if (!statusRes.ok) {
      await statusRes.body?.cancel();
      return (statusRes.status >= 300 && statusRes.status < 400) || statusRes.status === 404 ? notSeerr : { ok: false, status: 422, error: "seerr_error", message: `Seerr answered with an error (${statusRes.status}).` };
    }
    const info = await readSmallJson(statusRes);
    if (!info || typeof info.version !== "string" || typeof info.commitTag !== "string") return notSeerr;

    const meRes = await call(url, "/auth/me", apiKey);
    if (!meRes.ok) {
      await meRes.body?.cancel();
      return { ok: false, status: 422, error: "bad_key", message: "Seerr didn't accept that API key. Copy it from Seerr's Settings → General." };
    }
    const me = await readSmallJson(meRes);
    // Seerr permission bit 2 is Admin. The API key acts as the owner account.
    if (!me || typeof me.permissions !== "number" || (me.permissions & 2) === 0) {
      return { ok: false, status: 422, error: "key_not_admin", message: "That API key isn't an administrator's. Use the key from Seerr's Settings → General." };
    }
    return { ok: true, seerr: { version: info.version } };
  } catch {
    return { ok: false, status: 422, error: "unreachable", message: "Couldn't reach that address. Check it, and that Seerr is running." };
  }
}
