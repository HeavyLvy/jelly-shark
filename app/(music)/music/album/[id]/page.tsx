import { Suspense } from "react";
import { AlbumView } from "@/components/music/album-view";
import { MusicHeaderSkeleton } from "@/components/music/music-header";

export default function AlbumPage() {
  return (
    <Suspense fallback={<MusicHeaderSkeleton />}>
      <AlbumView />
    </Suspense>
  );
}
