import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { presetSvg } from "@/lib/brand";
import { getBranding, getIconAsset } from "@/lib/instance-store";

/** Same as --color-bg in globals.css. */
const BG = "#070d14";
const SIZES = [180, 192, 512];

/**
 * The brand icon as a square PNG for installing the app: iOS needs a PNG
 * apple-touch-icon (it ignores SVG), and Android/desktop want 192 and 512.
 * ?size=180|192|512, ?maskable=1 leaves room for Android's circular/rounded
 * masks. Full-bleed on the app's dark background, since iOS fills transparency
 * with black. Public.
 */
export async function GET(req: Request) {
  await connection(); // read at request time, never frozen at build
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("size"));
  const size = SIZES.includes(requested) ? requested : 512;
  const maskable = url.searchParams.get("maskable") === "1";
  const { brand } = getBranding();

  // Uploaded images are drawn as they are (the editor already framed them); presets are the glyph in the accent.
  // The renderer can't draw WebP, so an uploaded WebP falls back to the shark.
  const asset = brand.icon.kind === "upload" ? getIconAsset() : null;
  let src: string;
  let fill: number;
  if (asset && asset.mime !== "image/webp") {
    src = `data:${asset.mime};base64,${Buffer.from(asset.data).toString("base64")}`;
    fill = maskable ? 0.7 : 1;
  } else {
    const preset = brand.icon.kind === "preset" ? brand.icon.preset : "shark";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${presetSvg(preset).replaceAll("currentColor", brand.accent)}</svg>`;
    src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    fill = maskable ? 0.5 : 0.66;
  }
  const inner = Math.round(size * fill);

  // The ?v= the manifest adds changes with the branding, so those URLs can be cached for good.
  const versioned = url.searchParams.has("v");
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG, not shown in a page */}
        <img src={src} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300" } },
  );
}
