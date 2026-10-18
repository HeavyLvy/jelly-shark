import { Suspense } from "react";
import { PersonView, PersonSkeleton } from "@/components/person/person-view";

/** Actor / director page: photo, bio, and what they're in from your library. */
export default function PersonPage() {
  return (
    <Suspense fallback={<PersonSkeleton />}>
      <PersonView />
    </Suspense>
  );
}
