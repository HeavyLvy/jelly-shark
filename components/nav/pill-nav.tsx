"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, LibraryBig, Music2, Search, type LucideIcon } from "lucide-react";
import { BrandIcon, useBrandName } from "@/components/ui/brand-icon";
import { cn } from "@/components/ui/cn";
import { HomeFilled } from "@/components/ui/home-filled";
import { UserMenu } from "./user-menu";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home, match: (p) => p === "/" },
  {
    href: "/library",
    label: "Library",
    icon: LibraryBig,
    match: (p) => p.startsWith("/library") || p.startsWith("/item/") || p.startsWith("/show/"),
  },
  { href: "/music", label: "Music", icon: Music2, match: (p) => p.startsWith("/music") },
  { href: "/search", label: "Search", icon: Search, match: (p) => p.startsWith("/search") },
];

function isActive(tab: Tab, activePath: string | null) {
  return activePath !== null && tab.match(activePath);
}

/**
 * Phones: the tabs live at the bottom, where the thumb is. `data-app-tabs`
 * (globals.css) reserves the bar's height so the music player bar and page
 * content sit above it. Also used by Music, whose own tab bar stacks above it.
 */
function PhoneTabs({ activePath }: { activePath: string | null }) {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-app-tabs", "");
    return () => html.removeAttribute("data-app-tabs");
  }, []);
  return (
    // Floating pill like Prime Video's: inset from the edges, active tab on a light capsule.
    <nav aria-label="Primary" className="jelly fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[18.5rem] rounded-full bg-bg/95 p-1.5 sm:hidden">
      <ul className="grid grid-cols-4 gap-1">
        {TABS.map((tab) => {
          const active = isActive(tab, activePath);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[2.875rem] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-bold tracking-tight transition-colors",
                  active ? "bg-white/15 text-text" : "text-text active:bg-white/10",
                )}
              >
                {active && tab.href === "/" ? (
                  // Same active Home glyph as the music top bar.
                  <HomeFilled className="size-[22px] text-text" />
                ) : (
                  <Icon className={cn("size-[22px] transition-colors", active ? "stroke-[2.25] text-text" : "text-text-secondary")} aria-hidden="true" />
                )}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The phone tab bar on its own (for route groups without the pill nav, like Music). */
export function PhoneTabBar() {
  const pathname = usePathname();
  return <PhoneTabs activePath={pathname} />;
}

/** Phones: tabs at the bottom, only the profile stays up top. */
function PhoneChrome({ activePath }: { activePath: string | null }) {
  return (
    <div className="sm:hidden">
      {/* Scrim so the circles stay readable over scrolling content. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-20 bg-linear-to-b from-bg/90 via-bg/55 to-bg/0" />
      <div className="fixed top-3 right-3 z-50">
        <UserMenu floating />
      </div>
      <PhoneTabs activePath={activePath} />
    </div>
  );
}

function NavShell({ activePath }: { activePath: string | null }) {
  const brandName = useBrandName();
  return (
    <>
      <PhoneChrome activePath={activePath} />
      <DesktopPill activePath={activePath} brandName={brandName} />
    </>
  );
}

function DesktopPill({ activePath, brandName }: { activePath: string | null; brandName: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed top-3 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5 sm:flex sm:top-4",
        "jelly-shell",
      )}
    >
      <Link
        href="/"
        aria-label={`${brandName} home`}
        className="flex size-9 items-center justify-center rounded-full text-accent"
      >
        <BrandIcon className="size-6" />
      </Link>
      {TABS.map((tab) => {
        const active = isActive(tab, activePath);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition",
              active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text",
            )}
          >
            {active && tab.href === "/" ? <HomeFilled className="size-4" /> : <Icon className="size-4" aria-hidden="true" />}
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <UserMenu />
    </nav>
  );
}

/** Floating centered pill nav. The active tab is inverted. */
export function PillNav() {
  const pathname = usePathname();
  return <NavShell activePath={pathname} />;
}

/** Static fallback while the pathname is unknown (Suspense during prerender). */
export function PillNavFallback() {
  return <NavShell activePath={null} />;
}
