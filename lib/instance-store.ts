import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, instanceSettings } from "@/lib/db/schema";
import { DEFAULT_BRAND, isHexColor, isPresetId, type Brand, type BrandInput } from "@/lib/brand";

const BRANDING_KEY = "branding";
const ICON_KEY = "brand-icon";

export interface BrandingState {
  brand: Brand;
  /** True when something other than the defaults is saved. */
  custom: boolean;
  /** Changes whenever the branding or icon changes (cache-busting for the icon URL). */
  version: number;
}

/** Saved branding merged over the defaults; a damaged value falls back to the defaults. */
export function getBranding(): BrandingState {
  const row = db().select().from(instanceSettings).where(eq(instanceSettings.key, BRANDING_KEY)).get();
  const icon = db().select({ updatedAt: assets.updatedAt }).from(assets).where(eq(assets.key, ICON_KEY)).get();
  if (!row) return { brand: DEFAULT_BRAND, custom: false, version: 0 };
  try {
    const v = JSON.parse(row.value) as Partial<Brand>;
    const hasUpload = !!icon;
    const brand: Brand = {
      name: typeof v.name === "string" && v.name ? v.name : DEFAULT_BRAND.name,
      accent: isHexColor(v.accent) ? v.accent : DEFAULT_BRAND.accent,
      icon:
        v.icon?.kind === "upload" && hasUpload
          ? { kind: "upload" }
          : v.icon?.kind === "preset" && isPresetId(v.icon.preset)
            ? { kind: "preset", preset: v.icon.preset }
            : DEFAULT_BRAND.icon,
    };
    return { brand, custom: true, version: Math.max(row.updatedAt, icon?.updatedAt ?? 0) };
  } catch {
    return { brand: DEFAULT_BRAND, custom: false, version: 0 };
  }
}

export function saveBranding(input: BrandInput): void {
  const now = Date.now();
  const value = JSON.stringify(input);
  db()
    .insert(instanceSettings)
    .values({ key: BRANDING_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedAt: now } })
    .run();
}

export function getIconAsset() {
  return db().select().from(assets).where(eq(assets.key, ICON_KEY)).get() ?? null;
}

export function saveIconAsset(mime: string, data: Buffer): void {
  const now = Date.now();
  db()
    .insert(assets)
    .values({ key: ICON_KEY, mime, data, updatedAt: now })
    .onConflictDoUpdate({ target: assets.key, set: { mime, data, updatedAt: now } })
    .run();
}

/** Delete everything custom: back to the built-in defaults. */
export function resetBranding(): void {
  db().transaction((tx) => {
    tx.delete(instanceSettings).where(eq(instanceSettings.key, BRANDING_KEY)).run();
    tx.delete(assets).where(eq(assets.key, ICON_KEY)).run();
  });
}
