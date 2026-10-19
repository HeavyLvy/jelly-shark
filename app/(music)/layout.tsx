import { Suspense, type ReactNode } from "react";
import { PhoneTabBar } from "@/components/nav/pill-nav";
import { PlayerBar } from "@/components/player/player-bar";

/**
 * Music route group: like the main app shell but without the floating pill
 * nav on wider screens — the music shell has its own Spotify-style top bar. Phones
 * get the main tab bar at the bottom, under Music's own tabs. The audio engine
 * lives in the root layout, so moving between groups never interrupts playback.
 */
export default function MusicGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <main id="main" className="min-h-dvh">
        {children}
      </main>
      <PlayerBar />
      {/* Phones get the main tab bar here too (usePathname needs a Suspense boundary). */}
      <Suspense fallback={null}>
        <PhoneTabBar />
      </Suspense>
    </>
  );
}
