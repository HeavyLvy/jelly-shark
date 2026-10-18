import { NextResponse } from "next/server";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { browserDeviceId } from "@/lib/jellyfin/server";
import { rateLimited } from "@/lib/rate-limit";
import { getServerConfig, normalizeServerUrl, verifyJellyfin } from "@/lib/server-url";
import { writePendingServer } from "@/lib/session";

/**
 * Sign-in screen: "use a different Jellyfin server". Only when the admin lets
 * users choose. The address is verified to be a real Jellyfin server before
 * being remembered (in a sealed cookie), because this server will contact it.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const cfg = getServerConfig();
  if (cfg.policy !== "users") return jsonError(403, "server_locked", { message: "The server address is set by the administrator." });
  // Each check makes this server send a request, so keep the rate low.
  if (rateLimited(`server-check:${await browserDeviceId()}`, 12, 60_000)) return jsonError(429, "too_many_attempts", { message: "Too many tries. Wait a minute and try again." });

  const body = await readJsonBody<{ url?: unknown }>(req);
  const parsed = normalizeServerUrl(typeof body?.url === "string" ? body.url : "");
  if (!parsed.ok) return jsonError(400, "invalid_address", { message: parsed.error });
  const verified = await verifyJellyfin(parsed.url);
  if (!verified.ok) return jsonError(422, "not_jellyfin", { message: verified.error });
  await writePendingServer({ url: parsed.url });
  return NextResponse.json({ url: parsed.url, name: verified.server.name, version: verified.server.version }, { headers: { "Cache-Control": "no-store" } });
}

/** Forget the picked server: back to the default address. */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  await writePendingServer(null);
  return new NextResponse(null, { status: 204 });
}
