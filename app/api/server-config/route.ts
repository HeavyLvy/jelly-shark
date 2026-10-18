import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { getServerConfig, normalizeServerUrl, saveServerConfig, verifyJellyfin, type ServerPolicy } from "@/lib/server-url";

const noStore = { "Cache-Control": "no-store" };

/** The instance's server address and policy (Jellyfin administrators only). */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(getServerConfig(), { headers: noStore });
}

/**
 * Change the instance server address and/or policy (administrators only).
 * Body: `{ url?: string | null, policy?: "locked" | "users" }`; `url: null`
 * goes back to the JELLYFIN_URL default. A new address must answer like Jellyfin.
 */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJsonBody<{ url?: unknown; policy?: unknown }>(req);
  if (!body || typeof body !== "object") return jsonError(400, "invalid_body");

  const patch: { url?: string | null; policy?: ServerPolicy } = {};
  if (body.policy !== undefined) {
    if (body.policy !== "locked" && body.policy !== "users") return jsonError(400, "invalid_policy");
    patch.policy = body.policy;
  }
  if (body.url === null) patch.url = null;
  else if (body.url !== undefined) {
    const parsed = normalizeServerUrl(typeof body.url === "string" ? body.url : "");
    if (!parsed.ok) return jsonError(400, "invalid_address", { message: parsed.error });
    const verified = await verifyJellyfin(parsed.url);
    if (!verified.ok) return jsonError(422, "not_jellyfin", { message: verified.error });
    patch.url = parsed.url;
  }
  if (Object.keys(patch).length === 0) return jsonError(400, "empty");
  return NextResponse.json(saveServerConfig(patch), { headers: noStore });
}
