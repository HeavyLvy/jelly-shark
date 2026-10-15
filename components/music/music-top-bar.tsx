"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Clapperboard, Folders, Home, Search, Tv } from "lucide-react";
import { UserMenu } from "@/components/nav/user-menu";
import { cn } from "@/components/ui/cn";
import { FloatingMenu, type MenuAnchor } from "@/components/ui/floating-menu";
import { JellyGlyph } from "@/components/ui/logo";
import { addRecentSearch } from "@/lib/recent-searches";
import { menuItemCls } from "./track-menu";

/**
 * Spotify-style top bar for the music shell (replaces the pill nav on /music):
 * jellyfish menu (back out to Home / Library / Search) · music home + search · account.
 */
export function MusicTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const params = useSearchParams();
  const onSearch = pathname === "/music/search";
  const urlQuery = onSearch ? params.get("q") ?? "" : "";
  const [query, setQuery] = useState(urlQuery);
  // Follow the URL when it changes underneath us (recent-search click, back/forward, leaving search).
  const [syncedUrlQuery, setSyncedUrlQuery] = useState(urlQuery);
  if (urlQuery !== syncedUrlQuery) {
    setSyncedUrlQuery(urlQuery);
    setQuery(urlQuery);
  }
  const onMusicHome = pathname === "/music";

  /** Search-as-you-type: results live at /music/search?q= (the page debounces the fetch). */
  const onType = (value: string) => {
    setQuery(value);
    const url = value.trim() ? `/music/search?q=${encodeURIComponent(value)}` : "/music/search";
    setSyncedUrlQuery(value.trim() ? value : "");
    if (onSearch) window.history.replaceState(null, "", url);
    else router.push(url);
  };

  const close = (opts?: { restoreFocus?: boolean }) => {
    setAnchor(null);
    if (opts?.restoreFocus) logoRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addRecentSearch("music", query);
    if (!onSearch) router.push(`/music/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
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
        <JellyGlyph className="size-7" />
      </button>
      {anchor && (
        <FloatingMenu anchor={anchor} onClose={close} label="Go to" triggerRef={logoRef} className="w-56">
          <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Jelly Shark</p>
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
        <form role="search" onSubmit={submit} className="jelly-control flex h-12 w-full max-w-[29rem] items-center gap-3 rounded-full px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="music-search" className="sr-only">
            Search music
          </label>
          <input
            id="music-search"
            value={query}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => !onSearch && !query && router.push("/music/search")}
            placeholder="What do you want to play?"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
        </form>
      </div>

      <div className="flex shrink-0 justify-end">
        <UserMenu />
      </div>
    </header>
  );
}

/** Solid house with the door cut out (Spotify's active "home" glyph). */
function HomeFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M12 3.2 3.6 9.8a1 1 0 0 0-.4.8V20a1 1 0 0 0 1 1h4.6v-6.2a1 1 0 0 1 1-1h4.4a1 1 0 0 1 1 1V21h4.6a1 1 0 0 0 1-1v-9.4a1 1 0 0 0-.4-.8Z"
      />
    </svg>
  );
}
