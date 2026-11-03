"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { useSeerrCancel } from "@/lib/queries/seerr";

/**
 * "Cancel request" with a second step, since it can't be undone. `ids` are
 * requests of the signed-in person that are still waiting; all are cancelled.
 */
export function CancelRequest({ ids, title, size = "sm", variant = "secondary", onDone }: { ids: number[]; title: string; size?: "sm" | "md" | "lg"; variant?: "secondary" | "ghost"; onDone?: () => void }) {
  const cancel = useSeerrCancel();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      // One at a time, so a failure stops where it is and says so.
      for (const id of ids) await cancel.mutateAsync(id);
      setAsking(false);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel. Try again.");
    }
  };

  if (!asking) {
    return (
      <Button variant={variant} size={size} shape="card" onClick={() => setAsking(true)} icon={<X className="size-4" aria-hidden="true" />} aria-label={`Cancel request for ${title}`}>
        Cancel request
      </Button>
    );
  }
  return (
    <div role="group" aria-label={`Cancel request for ${title}?`} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-secondary">Cancel this request?</span>
      <Button variant="secondary" size={size} shape="card" disabled={cancel.isPending} onClick={() => void run()}>
        {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
      </Button>
      <Button variant="ghost" size={size} shape="card" disabled={cancel.isPending} onClick={() => setAsking(false)}>
        Keep it
      </Button>
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
