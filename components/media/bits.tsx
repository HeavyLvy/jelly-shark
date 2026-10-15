import { Check, Star } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Accent progress bar along a card's bottom edge. */
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label="Watched"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-1 w-full bg-overlay-strong", className)}
    >
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Accent circle with a check: item fully watched. */
export function WatchedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex size-7 items-center justify-center rounded-full bg-accent text-on-accent shadow", className)}
      role="img"
      aria-label="Watched"
    >
      <Check className="size-4" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}

/** "NEW" / "NEW EPS" pill. */
export function NewBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("rounded-[4px] bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-on-accent uppercase", className)}>
      {label}
    </span>
  );
}

/** Outlined parental rating, e.g. PG-13. */
export function RatingBadge({ rating, className }: { rating: string; className?: string }) {
  return (
    <span
      className={cn("rounded-[4px] border border-text-secondary/70 px-1.5 py-px text-[11px] font-semibold leading-4 text-text", className)}
      aria-label={`Rated ${rating}`}
    >
      {rating}
    </span>
  );
}

/** ★ 8.1 */
export function CommunityRating({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={`Rating ${value} out of 10`}>
      <Star className="size-3.5 fill-star text-star" aria-hidden="true" />
      {value}
    </span>
  );
}

/** Title shown on cards that have no artwork. */
export function ArtFallback({ title, className }: { title: string; className?: string }) {
  return (
    <div className={cn("absolute inset-0 flex items-end bg-surface-raised p-3", className)}>
      <span className="line-clamp-3 font-display text-lg leading-tight font-bold tracking-display text-text">{title}</span>
    </div>
  );
}
