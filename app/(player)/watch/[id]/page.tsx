import { Suspense } from "react";
import { WatchClient } from "@/components/video/watch-client";

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <WatchClient />
    </Suspense>
  );
}
