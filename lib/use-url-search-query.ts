"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Typing pause before the URL (and so the search) updates. */
export const SEARCH_DELAY_MS = 250;

/**
 * A search box whose text lives in `?q=` on a search page, shared by the main
 * Search page and the Music top bar.
 *
 * - The input owns the text while typing; the URL follows after a typing pause
 *   (`history.replaceState`, so no server round-trip and no history spam).
 * - A `?q=` change this hook didn't write came from outside (recent-search
 *   click, back/forward, the nav's Search link, leaving the page) and replaces
 *   the text. Telling our own (late-arriving) URL updates apart from those is
 *   the whole point: treating our own echo as outside input made the box reset
 *   mid-typing and drop letters.
 * - Off the search page (the Music top bar elsewhere in Music), the first
 *   keystroke navigates to the search page.
 * - Other query params (e.g. Search's `?type=`) are kept.
 *
 * `committed` is the text the URL holds, i.e. what results should search for.
 */
export function useUrlSearchQuery(searchPath: string) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const onPage = pathname === searchPath;
  const urlQuery = onPage ? (params.get("q") ?? "") : "";

  const [query, setQueryState] = useState(urlQuery);
  /** Last ?q= value this hook wrote. */
  const [written, setWritten] = useState(urlQuery);
  const [seen, setSeen] = useState(urlQuery);
  if (urlQuery !== seen) {
    setSeen(urlQuery);
    if (urlQuery !== written) {
      setWritten(urlQuery);
      setQueryState(urlQuery);
    }
  }

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const urlFor = useCallback(
    (value: string) => {
      const next = new URLSearchParams(onPage ? window.location.search : "");
      if (value.trim()) next.set("q", value);
      else next.delete("q");
      const qs = next.toString();
      return qs ? `${searchPath}?${qs}` : searchPath;
    },
    [onPage, searchPath],
  );

  const write = useCallback(
    (value: string) => {
      window.clearTimeout(timer.current);
      setWritten(value.trim() ? value : "");
      if (onPage) window.history.replaceState(null, "", urlFor(value));
      else router.push(urlFor(value));
    },
    [onPage, router, urlFor],
  );

  /** Update the text; the URL follows after the typing pause (or now, with `immediate`). */
  const setQuery = useCallback(
    (value: string, opts?: { immediate?: boolean }) => {
      setQueryState(value);
      window.clearTimeout(timer.current);
      if (opts?.immediate || !onPage) write(value);
      else timer.current = window.setTimeout(() => write(value), SEARCH_DELAY_MS);
    },
    [onPage, write],
  );

  /** Write the current text now (Enter), skipping the pause. */
  const flush = useCallback(() => write(query), [write, query]);

  return { query, setQuery, flush, committed: urlQuery, onPage };
}
