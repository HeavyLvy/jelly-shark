import { Suspense, type ReactNode } from "react";
import { LockPageScroll } from "@/components/lock-page-scroll";
import { LibrarySidebar } from "@/components/music/library-sidebar";
import { MusicTabBar } from "@/components/music/music-tab-bar";
import { MusicTopBar } from "@/components/music/music-top-bar";
import { NowPlayingPanel } from "@/components/music/now-playing-panel";
import { Skeleton } from "@/components/ui/states";

/**
 * Spotify-style music shell: top bar (shark logo menu · home + search ·
 * account) over three panels — library sidebar · page · now playing.
 *
 * Pinned to the viewport (top edge → player bar); the document never
 * scrolls, each panel scrolls on its own. The centre scroller is marked
 * `data-scroll-root` for sticky-header observers.
 *
 * Panels use `jelly-solid` (glass look, no backdrop-filter): they sit on a
 * flat background, so a blur would be invisible but expensive to repaint.
 */
export default function MusicLayout({ children }: { children: ReactNode }) {
  const panel = "jelly-solid min-h-0 overflow-hidden rounded-panel";
  return (
    // Ends above the player bar (which itself sits above the phone tab bar), or
    // above the tab bar when nothing plays. Bottom padding = the panel gap.
    <div className="fixed inset-x-0 top-0 bottom-[max(var(--player-space),var(--tabs-space,0px))] flex flex-col bg-bg-music pb-2">
      <LockPageScroll />
      <Suspense fallback={<div className="h-16" />}>
        <div className="relative z-30">
          <MusicTopBar />
        </div>
      </Suspense>
      <div className="grid min-h-0 flex-1 grid-rows-1 gap-2 sm:px-3 lg:grid-cols-[19.5rem_minmax(0,1fr)] xl:grid-cols-[19.5rem_minmax(0,1fr)_21.5rem]">
        <aside className={`${panel} hidden lg:block`}>
          <Suspense fallback={<Skeleton tone="raised" className="m-4 h-8 w-40" />}>
            <LibrarySidebar />
          </Suspense>
        </aside>
        {/* Phones: edge to edge, no panel chrome (every pixel counts). */}
        <div className="min-h-0 min-w-0 overflow-hidden sm:jelly-solid sm:rounded-panel">
          <div data-scroll-root className="h-full overflow-y-auto">
            {children}
          </div>
        </div>
        <aside className={`${panel} hidden xl:block`}>
          <NowPlayingPanel />
        </aside>
      </div>
      {/* usePathname() needs a Suspense boundary under cacheComponents. */}
      <Suspense fallback={null}>
        <MusicTabBar />
      </Suspense>
    </div>
  );
}
