import { cn } from "./cn";

/** Jellyfish glyph from the mockups (bell + tentacles), drawn in currentColor. */
export function JellyGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden="true">
      <path d="M3.5 12.5a8.5 8.5 0 0 1 17 0Z" fill="currentColor" />
      <path
        d="M6 15.5v4.5M10 15.5l-.6 5.5M14 15.5l.6 5.5M18 15.5V20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
