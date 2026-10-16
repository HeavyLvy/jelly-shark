"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LibraryBig, Music2, Search, type LucideIcon } from "lucide-react";
import { SharkGlyph } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";
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

function NavShell({ activePath }: { activePath: string | null }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5 sm:top-4",
        "jelly-shell",
      )}
    >
      <Link
        href="/"
        aria-label="Jelly Shark home"
        className="flex size-9 items-center justify-center rounded-full text-accent"
      >
        <SharkGlyph className="size-6" />
      </Link>
      {TABS.map((tab) => {
        const active = activePath !== null && tab.match(activePath);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition sm:px-3.5",
              active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{tab.label}</span>
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
