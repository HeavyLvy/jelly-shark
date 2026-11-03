import { Check, Clock, Download } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { SeerrStatus } from "@/lib/seerr/types";

/** The words for a title or season's state. `none` has none: it can be requested. */
export function statusLabel(status: SeerrStatus): string | null {
  switch (status) {
    case "pending":
      return "Requested";
    case "processing":
      return "Approved";
    case "partial":
      return "Partly available";
    case "available":
      return "Available";
    default:
      return null;
  }
}

/** Small pill for a status; renders nothing for `none`. */
export function StatusBadge({ status, className }: { status: SeerrStatus; className?: string }) {
  const label = statusLabel(status);
  if (!label) return null;
  const Icon = status === "available" ? Check : status === "pending" ? Clock : Download;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-semibold text-text ring-1 ring-hairline-strong", className)}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
