"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_BRAND, onAccent, type Brand } from "@/lib/brand";

/**
 * The instance branding in the browser. A copy is cached in localStorage and
 * applied before first paint by the inline script in app/layout.tsx (so a
 * custom accent doesn't flash the default one); refreshBrand() then asks the
 * server (/api/branding) and updates everything if it changed.
 */
export interface BrandState {
  brand: Brand;
  custom: boolean;
  /** Cache-buster for the icon URL. */
  version: number;
}

export const BRAND_CACHE_KEY = "jelly-shark-brand";
const DEFAULT_STATE: BrandState = { brand: DEFAULT_BRAND, custom: false, version: 0 };
const listeners = new Set<() => void>();
let current: BrandState | null = null;

function readCache(): BrandState {
  try {
    const p = JSON.parse(window.localStorage.getItem(BRAND_CACHE_KEY) ?? "null") as BrandState | null;
    if (p?.brand?.name && p.brand.accent && p.brand.icon) return p;
  } catch {
    // unreadable cache: use the defaults until the server answers
  }
  return DEFAULT_STATE;
}

function set(next: BrandState) {
  current = next;
  try {
    window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

/** Fetch the current branding from the server (public endpoint; works on the login page too). */
export async function refreshBrand(): Promise<BrandState | null> {
  try {
    const res = await fetch("/api/branding", { cache: "no-store" });
    if (!res.ok) return null;
    const state = (await res.json()) as BrandState;
    set(state);
    return state;
  } catch {
    return null;
  }
}

/** Use a server response we already have (e.g. right after saving). */
export function setBrandState(state: BrandState) {
  set(state);
}

export function useBrand(): BrandState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (current ??= readCache()),
    () => DEFAULT_STATE,
  );
}

export function iconUrl(version: number): string {
  return `/api/branding/icon?v=${version}`;
}

/** The CSS variables the accent color drives. */
export function accentVars(accent: string): Record<string, string> {
  return { "--color-accent": accent, "--color-on-accent": onAccent(accent) };
}
