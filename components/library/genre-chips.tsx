"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";

interface GenreChipsProps {
  genres: string[];
  value: string | null;
  onChange: (genre: string | null) => void;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}

const FADE = "48px";
const SCROLL_STEP = 240;

/**
 * One line of genre chips at every width. Overflow scrolls horizontally; the
 * clipped edge(s) fade out, and on desktop chevron buttons scroll the strip
 * for mouse users (keyboard focus scrolls chips into view on its own).
 */
export function GenreChips({ genres, value, onChange, isPending, isError, onRetry }: GenreChipsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [measure, genres.length, isPending]);

  const scrollBy = (dir: -1 | 1) => scrollerRef.current?.scrollBy({ left: dir * SCROLL_STEP, behavior: "smooth" });

  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black ${edges.start ? FADE : "0px"}, black calc(100% - ${
          edges.end ? FADE : "0px"
        }), ${edges.end ? "transparent" : "black"})`
      : undefined;

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1">
      {edges.start && (
        <span className="hidden lg:block">
          <IconButton variant="ghost" size="sm" aria-label="Scroll genres left" onClick={() => scrollBy(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </IconButton>
        </span>
      )}
      <div
        ref={scrollerRef}
        role="group"
        aria-label="Genre"
        onScroll={measure}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 py-1 scrollbar-none sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0.5"
      >
        <Chip active={value === null} onClick={() => onChange(null)} className="shrink-0">
          All
        </Chip>
        {isPending
          ? ["w-20", "w-16", "w-24", "w-20", "w-28"].map((w, i) => <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", w)} />)
          : genres.map((g) => (
              <Chip key={g} active={value === g} onClick={() => onChange(value === g ? null : g)} className="shrink-0">
                {g}
              </Chip>
            ))}
        {isError && (
          <button type="button" onClick={onRetry} className="shrink-0 px-2 text-sm font-medium whitespace-nowrap text-accent hover:underline">
            Couldn&apos;t load genres. Retry
          </button>
        )}
      </div>
      {edges.end && (
        <span className="hidden lg:block">
          <IconButton variant="ghost" size="sm" aria-label="Scroll genres right" onClick={() => scrollBy(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </IconButton>
        </span>
      )}
    </div>
  );
}
