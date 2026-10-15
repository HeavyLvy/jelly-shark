import { Suspense } from "react";
import { PlaylistView } from "@/components/music/playlist-view";
import { MusicHeaderSkeleton } from "@/components/music/music-header";

export default function PlaylistPage() {
  return (
    <Suspense fallback={<MusicHeaderSkeleton />}>
      <PlaylistView />
    </Suspense>
  );
}
