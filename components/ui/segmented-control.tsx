"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "./cn";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Render as a link (navigation) instead of a button. */
  href?: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange?: (value: T) => void;
  "aria-label": string;
  size?: "md" | "lg";
  className?: string;
}

/**
 * Pill segmented control (Movies / TV Shows / Collections, Season 1 / 2).
 * Active segment uses the accent fill. Arrow keys move between segments.
 */
export function SegmentedControl<T extends string>({ segments, value, onChange, size = "md", className, ...rest }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-segment]") ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (idx < 0) return;
    e.preventDefault();
    const next = items[(idx + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    next?.focus();
    next?.click();
  };

  const item = (active: boolean) =>
    cn(
      "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition",
      size === "lg" ? "h-11 px-6 text-base" : "h-9 px-4 text-sm",
      active ? "bg-accent text-on-accent" : "text-text-secondary hover:text-text",
    );

  return (
    <div
      ref={ref}
      role="group"
      aria-label={rest["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn("jelly inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1 scrollbar-none", className)}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return s.href ? (
          <Link key={s.value} href={s.href} data-segment aria-current={active ? "page" : undefined} className={item(active)} onClick={() => onChange?.(s.value)}>
            {s.label}
          </Link>
        ) : (
          <button key={s.value} type="button" data-segment aria-pressed={active} className={item(active)} onClick={() => onChange?.(s.value)}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
