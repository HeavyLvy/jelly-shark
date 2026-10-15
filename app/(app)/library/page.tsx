import { Suspense } from "react";
import type { Metadata } from "next";
import { LibrarySkeleton } from "@/components/library/library-skeleton";
import { LibraryView } from "@/components/library/library-view";

export const metadata: Metadata = { title: "Library" };

/** /library?type=movies|tv|collections — state lives in the URL, data loads in the browser. */
export default function LibraryPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryView />
    </Suspense>
  );
}
