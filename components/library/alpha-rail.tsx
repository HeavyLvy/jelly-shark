"use client";

import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { useDragScroll } from "@/lib/use-drag-scroll";
import { LETTERS } from "@/lib/queries/library";

function letterLabel(letter: string) {
  return letter === "#" ? "Titles starting with a number or symbol" : `Titles starting with ${letter}`;
}

interface AlphaRailProps {
  value: string | null;
  onChange: (letter: string | null) => void;
  /** Vertical sticky rail (desktop) or a compact horizontal strip (phone/tablet). */
  orientation: "vertical" | "horizontal";
  className?: string;
}

/**
 * # A … Z jump rail. Selecting the active letter clears it.
 * 27 × 24px targets need ~650px; RAIL_VERTICAL_CLASS / RAIL_HORIZONTAL_CLASS
 * show the vertical rail only on wide AND tall viewports (>= 800px) so targets
 * never shrink below 24px; everywhere else the horizontal strip is used.
 */
export const RAIL_VERTICAL_CLASS = "hidden lg:[@media(min-height:800px)]:block";
export const RAIL_HORIZONTAL_CLASS = "lg:[@media(min-height:800px)]:hidden";

export function AlphaRail({ value, onChange, orientation, className }: AlphaRailProps) {
  const vertical = orientation === "vertical";
  const stripRef = useRef<HTMLUListElement>(null);
  useDragScroll(stripRef);
  return (
    <nav aria-label="Filter by first letter" className={className}>
      <ul
        ref={stripRef}
        className={cn(
          vertical
            ? "flex flex-col items-center"
            : "-mx-4 flex gap-1 overflow-x-auto px-4 py-1 scrollbar-none sm:-mx-8 sm:px-8",
        )}
      >
        {LETTERS.map((letter) => {
          const active = value === letter;
          return (
            <li key={letter}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={letterLabel(letter)}
                onClick={() => onChange(active ? null : letter)}
                className={cn(
                  "flex items-center justify-center rounded-full font-semibold transition",
                  vertical
                    ? "size-6 text-[11px]"
                    : "size-8 shrink-0 text-xs",
                  active ? "bg-accent text-on-accent" : "text-muted hover:bg-overlay hover:text-text",
                )}
              >
                {letter}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
