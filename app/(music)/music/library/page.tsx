import { Suspense } from "react";
import { LibrarySidebar } from "@/components/music/library-sidebar";
import { Skeleton } from "@/components/ui/states";

/** "Your Library" as a full page: the phone/tablet tab for the sidebar that's hidden below lg. */
export default function MusicLibraryPage() {
  return (
    <div className="h-full">
      <Suspense fallback={<Skeleton tone="raised" className="m-4 h-8 w-40" />}>
        <LibrarySidebar />
      </Suspense>
    </div>
  );
}
