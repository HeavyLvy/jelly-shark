"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, LibraryBig, Search } from "lucide-react";
import { cn } from "@/components/ui/cn";

const TABS = [
  { href: "/music", label: "Home", icon: Home, match: (p: string) => p === "/music" },
  { href: "/music/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/music/search") },
  { href: "/music/library", label: "Your Library", icon: LibraryBig, match: (p: string) => p.startsWith("/music/library") },
];

/**
 * Spotify-style bottom tabs for Music below lg, where the library sidebar is
 * hidden. Sits at the very bottom; the player bar floats just above it
 * (globals.css: `--tabs-space`, set while this is mounted).
 */
export function MusicTabBar() {
  const pathname = usePathname();
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-music-tabs", "");
    return () => html.removeAttribute("data-music-tabs");
  }, []);
  return (
    <nav aria-label="Music" className="jelly fixed inset-x-0 bottom-0 z-40 rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid h-14 max-w-xl grid-cols-3">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition", active ? "text-text" : "text-muted hover:text-text-secondary")}
              >
                <Icon className={cn("size-[22px]", active && "stroke-[2.5]")} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
