import { Suspense } from "react";
import { DetailSkeleton } from "@/components/detail/detail-hero";
import { ShowDetailView } from "@/components/detail/show-detail-view";

/** Series detail with seasons and episodes. Data loads in the browser through the BFF proxy. */
export default function ShowPage() {
  return (
    <Suspense fallback={<DetailSkeleton variant="show" />}>
      <ShowDetailView />
    </Suspense>
  );
}
