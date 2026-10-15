import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "./cn";

/** Shape placeholder. Use tone="raised" when it sits on a surface-colored panel. */
export function Skeleton({ className, tone = "surface" }: { className?: string; tone?: "surface" | "raised" }) {
  return (
    <div
      className={cn("animate-pulse rounded-card motion-reduce:animate-none", tone === "raised" ? "bg-surface-raised" : "bg-surface", className)}
      aria-hidden="true"
    />
  );
}

interface StateProps {
  title: string;
  /** Heading level for the title; use "h1" when the state is the whole page. */
  as?: "h1" | "h2" | "h3";
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, as: Heading = "h2", description, action, className }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}>
      <Inbox className="size-8 text-muted" aria-hidden="true" />
      <Heading className="font-display text-xl font-bold">{title}</Heading>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, as: Heading = "h2", description, action, className }: StateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}>
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <Heading className="font-display text-xl font-bold">{title}</Heading>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block size-5 animate-spin rounded-full border-2 border-hairline-strong border-t-accent", className)}
    />
  );
}
