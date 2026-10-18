import { connection, NextResponse } from "next/server";
import { parseBrand } from "@/lib/brand";
import { requireAdmin } from "@/lib/admin";
import { isSameOrigin, jsonError, readJsonBody } from "@/lib/http";
import { getBranding, getIconAsset, resetBranding, saveBranding } from "@/lib/instance-store";

/** The instance branding. Public: the login page needs it before anyone signs in. */
export async function GET() {
  await connection(); // read at request time, never frozen at build
  const { brand, custom, version } = getBranding();
  return NextResponse.json({ brand, custom, version }, { headers: { "Cache-Control": "no-store" } });
}

/** Save branding (Jellyfin administrators only). An uploaded icon is sent separately to /api/branding/icon. */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = parseBrand(await readJsonBody(req));
  if (!parsed.ok) return jsonError(400, "invalid_branding", { detail: parsed.error });
  if (parsed.value.icon.kind === "upload" && !getIconAsset()) return jsonError(400, "invalid_branding", { detail: "Upload an icon first." });
  saveBranding(parsed.value);
  return NextResponse.json(getBranding(), { headers: { "Cache-Control": "no-store" } });
}

/** Back to the built-in defaults (Jellyfin administrators only). */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  resetBranding();
  return NextResponse.json(getBranding(), { headers: { "Cache-Control": "no-store" } });
}
