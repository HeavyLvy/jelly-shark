import { Suspense } from "react";
import { DiscoverRowPage } from "@/components/seerr/discover-browse";
import { DiscoverSkeleton } from "@/components/seerr/discover-view";

/** /discover/<row>: one Discover row as a full grid. */
export default function DiscoverRowRoute() {
  return (
    <Suspense fallback={<DiscoverSkeleton />}>
      <DiscoverRowPage />
    </Suspense>
  );
}
