"use client";

import { useEffect } from "react";

/** Disables document scrolling while mounted (layouts whose panels scroll internally). */
export function LockPageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);
  return null;
}
