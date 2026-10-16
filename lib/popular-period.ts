"use client";

import { useSyncExternalStore } from "react";
import { POPULAR_PERIODS, type PopularPeriod } from "@/lib/queries/home";

/** Home "Most Popular" period, remembered per browser. Default: past 2 weeks. */
const KEY = "jelly-shark-popular-period";
const DEFAULT: PopularPeriod = "2w";
const listeners = new Set<() => void>();

function read(): PopularPeriod {
  try {
    const v = window.localStorage.getItem(KEY);
    return POPULAR_PERIODS.some((p) => p.value === v) ? (v as PopularPeriod) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setPopularPeriod(period: PopularPeriod) {
  try {
    window.localStorage.setItem(KEY, period);
  } catch {
    // storage unavailable: the choice lasts until reload
  }
  current = period;
  listeners.forEach((l) => l());
}

let current: PopularPeriod | null = null;

export function usePopularPeriod(): PopularPeriod {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (current ??= read()),
    () => DEFAULT,
  );
}
