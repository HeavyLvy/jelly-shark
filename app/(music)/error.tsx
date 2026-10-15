"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function SegmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-28">
      <ErrorState
        as="h1"
        title="Something went wrong"
        description="This page hit an unexpected error."
        action={<Button onClick={() => retry()}>Try again</Button>}
      />
    </div>
  );
}
