import { connection } from "next/server";
import { ICON_MAX_BYTES, presetFaviconSvg, sniffIcon, svgProblem } from "@/lib/brand";
import { requireAdmin } from "@/lib/admin";
import { isSameOrigin, jsonError } from "@/lib/http";
import { getBranding, getIconAsset, saveIconAsset } from "@/lib/instance-store";

/** Headers that make an image safe to open directly in a tab, SVG included (no scripts, nothing else loads). */
const SAFE = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
};

/**
 * The brand icon as an image (used for the favicon and shown in the UI). Public.
 * Always a valid image: the uploaded one, else the chosen preset, else the default.
 * Callers add ?v=<version>, which is why it can be cached for a year.
 */
export async function GET() {
  await connection(); // read at request time, never frozen at build
  const { brand, version } = getBranding();
  const headers = { ...SAFE, "Cache-Control": version ? "public, max-age=31536000, immutable" : "public, max-age=300" };
  if (brand.icon.kind === "upload") {
    const asset = getIconAsset();
    if (asset) return new Response(new Uint8Array(asset.data), { headers: { ...headers, "Content-Type": asset.mime } });
  }
  const preset = brand.icon.kind === "preset" ? brand.icon.preset : "shark";
  return new Response(presetFaviconSvg(preset, brand.accent), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}

/** Upload a custom icon: the raw image as the request body (PNG, JPEG, WebP or SVG, up to 512 KB). Administrators only. */
export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "cross_origin");
  const denied = await requireAdmin();
  if (denied) return denied;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > ICON_MAX_BYTES) return jsonError(413, "too_large", { detail: "The icon must be 512 KB or smaller." });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return jsonError(400, "empty");
  if (bytes.length > ICON_MAX_BYTES) return jsonError(413, "too_large", { detail: "The icon must be 512 KB or smaller." });
  const mime = sniffIcon(bytes);
  if (!mime) return jsonError(415, "unsupported_type", { detail: "Use a PNG, JPEG, WebP or SVG image." });
  if (mime === "image/svg+xml") {
    const problem = svgProblem(new TextDecoder().decode(bytes));
    if (problem) return jsonError(400, "unsafe_svg", { detail: problem });
  }
  saveIconAsset(mime, Buffer.from(bytes));
  return new Response(null, { status: 204 });
}
