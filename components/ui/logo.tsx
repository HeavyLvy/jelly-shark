import { cn } from "./cn";

/** Jelly Shark mark: a dorsal fin cutting through a wave, drawn in currentColor. Same shape as app/icon.svg. */
export function SharkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden="true">
      <path d="M4.5 16C6 10.5 9.6 5 15.6 3c-1.5 3.8-1.3 8.6.6 13Z" fill="currentColor" />
      <path
        d="M2 19.5c1.7 0 2-1.6 3.4-1.6s1.7 1.6 3.3 1.6 1.8-1.6 3.3-1.6 1.7 1.6 3.3 1.6 1.8-1.6 3.3-1.6 1.7 1.6 3.4 1.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
