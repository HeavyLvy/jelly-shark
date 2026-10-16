"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useDragScroll } from "@/lib/use-drag-scroll";

interface MediaRowProps {
  title: ReactNode;
  /** Small muted line under the heading. */
  subtitle?: ReactNode;
  /** Plain-text title for the region label when `title` contains markup. */
  label?: string;
  seeAllHref?: string;
  /** Extra header content on the right (e.g. an "Open Music" button). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Gap between cards (Tailwind gap class). */
  gapClassName?: string;
}

/**
 * Horizontal scroll row with a heading, optional "See all", and arrow
 * buttons that page by ~one viewport. Native scroll + snap, so touch and
 * trackpads work; mouse users can also click-and-drag. Arrows disable at the ends.
 */
export function MediaRow({ title, subtitle, label, seeAllHref, action, children, className, gapClassName = "gap-4" }: MediaRowProps) {
  const headingId = useId();
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useDragScroll(scroller);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update, children]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section aria-labelledby={label ? undefined : headingId} aria-label={label} className={cn("relative", className)}>
      <div className="mb-3 flex items-center justify-between gap-4 px-4 sm:px-8 lg:px-11">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 id={headingId} className="truncate font-display text-xl font-bold tracking-tight sm:text-[22px]">
              {title}
            </h2>
            {seeAllHref && (
              <Link href={seeAllHref} className="shrink-0 text-xs font-semibold text-accent hover:underline">
                See all ›
              </Link>
            )}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted sm:text-[13px]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <div className={cn("hidden gap-2 md:flex", edges.start && edges.end && "md:hidden")}>
            <IconButton aria-label="Scroll left" size="sm" onClick={() => page(-1)} disabled={edges.start}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </IconButton>
            <IconButton aria-label="Scroll right" size="sm" onClick={() => page(1)} disabled={edges.end}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </div>
      <ul
        ref={scroller}
        className={cn(
          "flex snap-x snap-mandatory scroll-px-4 overflow-x-auto overflow-y-hidden px-4 pb-2 scrollbar-none sm:scroll-px-8 sm:px-8 lg:scroll-px-11 lg:px-11",
          gapClassName,
        )}
      >
        {children}
      </ul>
    </section>
  );
}

/** List item wrapper for MediaRow children (snap alignment). */
export function RowItem({ children }: { children: ReactNode }) {
  return <li className="shrink-0 snap-start">{children}</li>;
}
