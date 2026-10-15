import { Suspense } from "react";
import { ArtistView } from "@/components/music/artist-view";
import { MusicHeaderSkeleton } from "@/components/music/music-header";

export default function ArtistPage() {
  return (
    <Suspense fallback={<MusicHeaderSkeleton round />}>
      <ArtistView />
    </Suspense>
  );
}
