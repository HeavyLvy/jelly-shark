"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/components/ui/cn";
import { imageSrc, type ImageRef } from "@/lib/jellyfin/images";
import { BlurhashCanvas } from "./blurhash-canvas";

interface JfImageProps {
  image: ImageRef | null;
  /** Alt text; pass "" for decorative art next to a visible title. */
  alt: string;
  /** Responsive sizes hint, e.g. "176px" or "100vw". Drives Jellyfin's maxWidth. */
  sizes: string;
  className?: string;
  imgClassName?: string;
  /** Above-the-fold images (heroes). */
  preload?: boolean;
  quality?: number;
  /** Rendered when there is no image or it fails to load. */
  fallback?: ReactNode;
  /** object-fit; logos use "contain". */
  fit?: "cover" | "contain";
}

/**
 * Jellyfin artwork through the proxy: blurhash placeholder underneath,
 * the real image fades in on load, and a fallback (e.g. the title) when the
 * item has no art. The parent must size the box (aspect ratio / fixed size).
 */
export function JfImage({ image, alt, sizes, className, imgClassName, preload, quality, fallback, fit = "cover" }: JfImageProps) {
  const src = image ? imageSrc(image) : null;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  const loaded = src !== null && loadedSrc === src;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {image?.blurhash && !loaded && !failed && <BlurhashCanvas hash={image.blurhash} />}
      {src && !failed && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          quality={quality}
          preload={preload}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cn(
            "transition-opacity duration-300",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
      {(!src || failed) && fallback}
    </div>
  );
}
