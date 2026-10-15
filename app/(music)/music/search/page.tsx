import { Suspense } from "react";
import { MusicSearch } from "@/components/music/music-search";

export default function MusicSearchPage() {
  return (
    <Suspense fallback={null}>
      <MusicSearch />
    </Suspense>
  );
}
