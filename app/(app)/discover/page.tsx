import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoverView, DiscoverSkeleton } from "@/components/seerr/discover-view";

export const metadata: Metadata = { title: "Discover · Jelly Shark" };

export default function DiscoverPage() {
  return (
    <Suspense fallback={<DiscoverSkeleton />}>
      <DiscoverView />
    </Suspense>
  );
}
