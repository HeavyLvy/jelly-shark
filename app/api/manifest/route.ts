import { connection } from "next/server";
import { getBranding } from "@/lib/instance-store";

/** Same as --color-bg in globals.css: the splash screen and window color while the app starts. */
const BG = "#070d14";

/**
 * Web app manifest, built from the instance branding so the installed app
 * carries the custom name and icon. Public (browsers fetch it without cookies).
 */
export async function GET() {
  await connection(); // read at request time, never frozen at build
  const { brand, version } = getBranding();
  const icon = (size: number, purpose: "any" | "maskable") => ({
    src: `/api/pwa-icon?size=${size}${purpose === "maskable" ? "&maskable=1" : ""}&v=${version}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  });
  const manifest = {
    id: "/",
    name: brand.name,
    short_name: brand.name.slice(0, 12),
    description: "A custom Jellyfin frontend",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BG,
    theme_color: BG,
    icons: [icon(192, "any"), icon(512, "any"), icon(512, "maskable")],
    // Long-press the home-screen icon (Android, desktop) for these.
    shortcuts: [
      { name: "Search", url: "/search" },
      { name: "Music", url: "/music" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
  });
}
