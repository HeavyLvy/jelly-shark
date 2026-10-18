"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";

/** Scroll speed for overflowing text (px per second). */
const SPEED = 32;

/**
 * Single-line text that, when too long for its box, slowly scrolls to its end
 * and back (with pauses), like Spotify's Now Playing title. Static when it
 * fits, and under prefers-reduced-motion (truncates instead).
 */
export function Marquee({ children, className }: { children: ReactNode; className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const ro = new ResizeObserver(() => setShift(Math.max(0, Math.ceil(text.scrollWidth - box.clientWidth))));
    ro.observe(box);
    ro.observe(text);
    return () => ro.disconnect();
  }, []);

  const moving = shift > 0;
  return (
    <span ref={boxRef} className={cn("block overflow-hidden whitespace-nowrap", className)}>
      <span
        ref={textRef}
        className={cn("inline-block", moving && "motion-safe:animate-[marquee_var(--marquee-duration)_ease-in-out_infinite_alternate] motion-reduce:block motion-reduce:truncate")}
        style={moving ? ({ "--marquee-shift": `-${shift}px`, "--marquee-duration": `${(shift / SPEED + 3).toFixed(1)}s` } as CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  );
}
