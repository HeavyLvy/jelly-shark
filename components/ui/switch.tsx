"use client";

import { cn } from "./cn";

/** On/off switch (role="switch"). */
export function Switch({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-overlay-strong", className)}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-text shadow transition-all", checked ? "left-[1.375rem]" : "left-0.5")} />
    </button>
  );
}
