import { Suspense } from "react";
import { DetailSkeleton } from "@/components/detail/detail-hero";
import { SeerrPage } from "@/components/seerr/seerr-page";

/** A movie, show or person from Seerr, which may not be in the library yet. Data loads in the browser, like the other detail pages. */
export default function RequestPage() {
  return (
    <Suspense fallback={<DetailSkeleton variant="movie" />}>
      <SeerrPage />
    </Suspense>
  );
}
