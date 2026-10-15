import type { ReactNode } from "react";

/** Temporary page body for routes that land in later phases. */
export function Placeholder({ title, phase, children }: { title: string; phase: number; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-8">
      <h1 className="font-display text-5xl font-extrabold tracking-display sm:text-6xl">{title}</h1>
      <p className="mt-3 text-muted">Arrives in phase {phase}.</p>
      {children}
    </div>
  );
}
