"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clapperboard, Folders, Home, Search, Tv } from "lucide-react";
import { UserMenu } from "@/components/nav/user-menu";
import { cn } from "@/components/ui/cn";
import { FloatingMenu, type MenuAnchor } from "@/components/ui/floating-menu";
import { SharkGlyph } from "@/components/ui/logo";
import { addRecentSearch } from "@/lib/recent-searches";
import { menuItemCls } from "./track-menu";

/**
 * Spotify-style top bar for the music shell (replaces the pill nav on /music):
 * shark logo menu (back out to Home / Library / Search) · music home + search · account.
 */
export function MusicTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const params = useSearchParams();
  const onSearch = pathname === "/music/search";
  const urlQuery = onSearch ? params.get("q") ?? "" : "";
  // The input owns the text while typing; the URL (?q=) follows it after a pause.
  const [query, setQuery] = useState(urlQuery);
  /** Last ?q= this input wrote. A URL change to anything else came from outside
   *  (recent-search click, back/forward, leaving search) and replaces the text. */
  const [written, setWritten] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== written) {
      setWritten(urlQuery);
      setQuery(urlQuery);
    }
  }
  const onMusicHome = pathname === "/music";

  const writeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(writeTimer.current), []);
  const searchUrl = (value: string) => (value.trim() ? `/music/search?q=${encodeURIComponent(value)}` : "/music/search");

  /** Search-as-you-type: results live at /music/search?q=, written ~250ms after the last keystroke. */
  const onType = (value: string) => {
    setQuery(value);
    window.clearTimeout(writeTimer.current);
    const write = () => {
      setWritten(value.trim() ? value : "");
      window.history.replaceState(null, "", searchUrl(value));
    };
    if (onSearch) writeTimer.current = window.setTimeout(write, 250);
    else {
      // First keystroke elsewhere in Music: go to the search page right away.
      setWritten(value.trim() ? value : "");
      router.push(searchUrl(value));
    }
  };

  const close = (opts?: { restoreFocus?: boolean }) => {
    setAnchor(null);
    if (opts?.restoreFocus) logoRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addRecentSearch("music", query);
    // Enter searches now, skipping the typing pause.
    window.clearTimeout(writeTimer.current);
    if (onSearch) {
      setWritten(query.trim() ? query : "");
      window.history.replaceState(null, "", searchUrl(query));
    }
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
        <SharkGlyph className="size-7" />
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
