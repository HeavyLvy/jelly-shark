"use client";

import type { ImageLoaderProps } from "next/image";

/**
 * next/image loader (configured via images.loaderFile). Jellyfin resizes
 * server-side, so we append its maxWidth/quality params to proxied image
 * URLs instead of going through /_next/image (which can't carry the
 * session cookie).
 */
export default function jellyfinImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (src.startsWith("/api/jf/")) {
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}maxWidth=${width}&quality=${quality ?? 85}`;
  }
  return src;
}
