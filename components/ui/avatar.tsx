import Image from "next/image";
import { cn } from "./cn";

interface AvatarProps {
  name: string;
  src: string | null;
  /** Rendered size in px. */
  size?: number;
  className?: string;
}

/** Circular user avatar; falls back to the initial on the warm avatar color. */
export function Avatar({ name, src, size = 28, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-avatar font-semibold text-bg",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
      aria-hidden="true"
    >
      {/* Jellyfin's /UserImage can't resize, so skip the srcset (one fetch, not several). */}
      {src ? <Image src={src} alt="" fill unoptimized className="object-cover" /> : initial}
    </span>
  );
}
