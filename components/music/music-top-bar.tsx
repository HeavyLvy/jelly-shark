"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Clapperboard, Folders, Home, LibraryBig, Search, Tv } from "lucide-react";
import { UserMenu } from "@/components/nav/user-menu";
import { cn } from "@/components/ui/cn";
import { FloatingMenu, type MenuAnchor } from "@/components/ui/floating-menu";
import { BrandIcon, useBrandName } from "@/components/ui/brand-icon";
import { addRecentSearch } from "@/lib/recent-searches";
import { useUrlSearchQuery } from "@/lib/use-url-search-query";
import { HomeFilled } from "@/components/ui/home-filled";
import { menuItemCls } from "./track-menu";

/**
 * Spotify-style top bar for the music shell (replaces the pill nav on /music):
 * shark logo menu (back out to Home / Library / Search) · music home + search · account.
 */
export function MusicTopBar() {
  const brandName = useBrandName();
  const pathname = usePathname();
  const router = useRouter();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const { query, setQuery, flush, onPage: onSearch } = useUrlSearchQuery("/music/search");
  const onMusicHome = pathname === "/music";
  const onMusicLibrary = pathname.startsWith("/music/library");

  /** Search-as-you-type: results live at /music/search?q= (see useUrlSearchQuery). */
  const onType = (value: string) => setQuery(value);

  const close = (opts?: { restoreFocus?: boolean }) => {
    setAnchor(null);
    if (opts?.restoreFocus) logoRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addRecentSearch("music", query);
    // Enter searches now, skipping the typing pause.
    flush();
  };

  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/library?type=movies", label: "Movies", icon: Clapperboard },
    { href: "/library?type=tv", label: "TV Shows", icon: Tv },
    { href: "/library?type=collections", label: "Collections", icon: Folders },
    { href: "/search", label: "Search", icon: Search },
  ];

  return (
    <header className="flex h-16 items-center gap-2 px-2 sm:gap-3 sm:px-3">
      <button
        ref={logoRef}
        type="button"
        aria-label="Leave Music"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={() => {
          if (anchor) return setAnchor(null);
          const r = logoRef.current?.getBoundingClientRect();
          if (r) setAnchor({ x: r.left, y: r.bottom + 6 });
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-accent transition hover:bg-overlay"
      >
        <BrandIcon className="size-7" />
      </button>
      {anchor && (
        <FloatingMenu anchor={anchor} onClose={close} label="Go to" triggerRef={logoRef} className="w-56">
          <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">{brandName}</p>
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" className={menuItemCls} onClick={() => close()}>
              <Icon className="size-4" aria-hidden="true" /> {label}
            </Link>
          ))}
        </FloatingMenu>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Link
          href="/music"
          aria-label="Music home"
          aria-current={onMusicHome ? "page" : undefined}
          className={cn("jelly-control flex size-12 shrink-0 items-center justify-center rounded-full transition", onMusicHome ? "text-text" : "text-text-secondary hover:text-text")}
        >
          {onMusicHome ? <HomeFilled className="size-5" /> : <Home className="size-5" aria-hidden="true" />}
        </Link>
        {/* Phones: Music's own tab bar is hidden (the main tab bar is enough), so Your Library lives here. */}
        <Link
          href="/music/library"
          aria-label="Your Library"
          aria-current={onMusicLibrary ? "page" : undefined}
          className={cn("jelly-control flex size-12 shrink-0 items-center justify-center rounded-full transition sm:hidden", onMusicLibrary ? "text-text" : "text-text-secondary hover:text-text")}
        >
          <LibraryBig className={cn("size-5", onMusicLibrary && "stroke-[2.5]")} aria-hidden="true" />
        </Link>
        <form role="search" onSubmit={submit} className="jelly-control flex h-12 w-full max-w-[29rem] items-center gap-3 rounded-full px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="music-search" className="sr-only">
            Search music
          </label>
          <span className="relative flex min-w-0 flex-1 items-center">
            <input
              id="music-search"
              value={query}
              onChange={(e) => onType(e.target.value)}
              onFocus={() => !onSearch && !query && router.push("/music/search")}
              autoComplete="off"
              className="w-full min-w-0 bg-transparent text-sm text-text focus:outline-none"
            />
            {/* Placeholder that fits: short on phones, Spotify's line on wider screens. */}
            {!query && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-sm text-muted">
                <span className="sm:hidden">Search</span>
                <span className="hidden sm:inline">What do you want to play?</span>
              </span>
            )}
          </span>
        </form>
      </div>

      <div className="flex shrink-0 justify-end">
        <UserMenu />
      </div>
    </header>
  );
}
