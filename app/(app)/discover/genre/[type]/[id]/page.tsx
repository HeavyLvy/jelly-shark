import { Suspense } from "react";
import { GenrePage } from "@/components/seerr/discover-browse";
import { DiscoverSkeleton } from "@/components/seerr/discover-view";

/** /discover/genre/<movie|tv>/<id>: the titles in one genre. */
export default function GenreRoute() {
  return (
    <Suspense fallback={<DiscoverSkeleton />}>
      <GenrePage />
    </Suspense>
  );
}
