import { Suspense } from "react";
import { MusicHome } from "@/components/music/music-home";
import { TrackTableSkeleton } from "@/components/music/track-table";

export default function MusicPage() {
  return (
    <Suspense fallback={<div className="p-7"><TrackTableSkeleton /></div>}>
      <MusicHome />
    </Suspense>
  );
}
