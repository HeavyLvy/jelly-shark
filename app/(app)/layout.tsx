import { Suspense, type ReactNode } from "react";
import { PillNav, PillNavFallback } from "@/components/nav/pill-nav";
import { PlayerBar } from "@/components/player/player-bar";

/** Shell for the four main tabs: floating pill nav + persistent music player bar. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      {/* usePathname suspends on dynamic routes under cacheComponents. */}
      <Suspense fallback={<PillNavFallback />}>
        <PillNav />
      </Suspense>
      <main id="main" className="min-h-dvh">
        {children}
      </main>
      <PlayerBar />
    </>
  );
}
