"use client";

import { useEffect } from "react";
import { usePosterWidth } from "@/lib/ui-prefs";

/** Applies the poster-size preference to the CSS variables every poster derives from. */
export function UiPrefsApplier() {
  const width = usePosterWidth();
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--poster-width", `${width}px`);
    html.style.setProperty("--poster-grid-min", `${Math.round(width * 0.92)}px`);
  }, [width]);
  return null;
}
