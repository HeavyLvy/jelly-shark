import { Suspense } from "react";
import { DetailSkeleton } from "@/components/detail/detail-hero";
import { MovieDetailView } from "@/components/detail/movie-detail-view";

/** Movie / collection detail. Data loads in the browser through the BFF proxy. */
export default function ItemPage() {
  return (
    <Suspense fallback={<DetailSkeleton variant="movie" />}>
      <MovieDetailView />
    </Suspense>
  );
}
