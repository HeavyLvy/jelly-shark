"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True once the returned ref's element has scrolled above the top of the
 * nearest `[data-scroll-root]` (minus `offset` px, e.g. a sticky bar's height).
 * Used for Spotify-style sticky headers inside the music centre panel.
 */
export function useScrolledPast<T extends HTMLElement>(offset = 0) {
  const ref = useRef<T>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.closest<HTMLElement>("[data-scroll-root]");
    const io = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0;
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < rootTop + offset);
      },
      { root, rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [offset]);

  return [ref, past] as const;
}
