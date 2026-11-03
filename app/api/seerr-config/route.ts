import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { clearSeerrConfig, getSeerrConfig, saveSeerrConfig } from "@/lib/seerr/config";
import { verifySeerr } from "@/lib/seerr/verify";
import { normalizeServerUrl } from "@/lib/server-url";

const noStore = { "Cache-Control": "no-store" };

/** What the browser may know: the address and whether a key is saved, never the key. */
function publicConfig() {
  const config = getSeerrConfig();
  return { configured: !!config, url: config?.url ?? null };
}

/** The Seerr connection (Jellyfin administrators only). */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(publicConfig(), { headers: noStore });
}

/**
 * Save the Seerr connection. Body: `{ url: string, apiKey?: string }`. Leave
 * `apiKey` out to keep the saved one (same address only). The address and key
 * are checked against Seerr before anything is saved.
 */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJsonBody<{ url?: unknown; apiKey?: unknown }>(req);
  if (!body || typeof body !== "object") return jsonError(400, "invalid_body");

  const parsed = normalizeServerUrl(typeof body.url === "string" ? body.url : "");
  if (!parsed.ok) return jsonError(400, "invalid_address", { message: parsed.error });

  const typedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (body.apiKey !== undefined && typeof body.apiKey !== "string") return jsonError(400, "invalid_body");
  if (typedKey.length > 200) return jsonError(400, "invalid_key", { message: "That API key is too long." });
  const saved = getSeerrConfig();
  // A saved key only goes with the address it was saved for.
  const apiKey = typedKey || (saved && saved.url === parsed.url ? saved.apiKey : "");
  if (!apiKey) return jsonError(400, "missing_key", { message: "Enter the API key from Seerr's Settings → General." });

  const verified = await verifySeerr(parsed.url, apiKey);
  if (!verified.ok) return jsonError(verified.status, verified.error, { message: verified.message });

  saveSeerrConfig({ url: parsed.url, apiKey });
  return NextResponse.json({ ...publicConfig(), version: verified.seerr.version }, { headers: noStore });
}

/** Disconnect Seerr: forget the address and key. */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  clearSeerrConfig();
  return NextResponse.json(publicConfig(), { headers: noStore });
}
