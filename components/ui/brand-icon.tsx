"use client";

import { presetSvg } from "@/lib/brand";
import { iconUrl, useBrand } from "@/lib/brand-client";
import { cn } from "./cn";

/** The brand's icon: a preset drawn in the current text color, or the uploaded image. */
export function BrandIcon({ className }: { className?: string }) {
  const { brand, version } = useBrand();
  if (brand.icon.kind === "upload") {
    // eslint-disable-next-line @next/next/no-img-element -- a tiny dynamic brand image, not content
    return <img src={iconUrl(version)} alt="" aria-hidden="true" className={cn("size-6 rounded-[22%] object-contain", className)} />;
  }
  return <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden="true" dangerouslySetInnerHTML={{ __html: presetSvg(brand.icon.preset) }} />;
}

/** The brand name as text. */
export function useBrandName(): string {
  return useBrand().brand.name;
}
