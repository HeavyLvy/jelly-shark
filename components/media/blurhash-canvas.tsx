"use client";

import { useEffect, useRef } from "react";
import { decode, isBlurhashValid } from "blurhash";
import { cn } from "@/components/ui/cn";

const SIZE = 32;

/** Decodes a blurhash into a tiny canvas stretched to fill its parent. */
export function BlurhashCanvas({ hash, className }: { hash: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !isBlurhashValid(hash).result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = decode(hash, SIZE, SIZE);
    const imageData = ctx.createImageData(SIZE, SIZE);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  }, [hash]);

  return <canvas ref={ref} width={SIZE} height={SIZE} aria-hidden="true" className={cn("absolute inset-0 size-full", className)} />;
}
