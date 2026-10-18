import type { CSSProperties } from "react";

/**
 * Display tunables. Single source of truth for poster size: set
 * NEXT_PUBLIC_POSTER_WIDTH (px) in .env.local. It is inlined at build time:
 * restart `next dev`, or re-run `next build` for production.
 * Everything else (the `w-poster` token, poster grids, rank-card posters,
 * image `sizes` hints) derives from it.
 */

const DEFAULT_POSTER_WIDTH = 215;

function readPosterWidth(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw?.trim() || !Number.isFinite(n) || n <= 0) return DEFAULT_POSTER_WIDTH;
  return Math.min(400, Math.max(120, Math.round(n)));
}

/** Target poster width in CSS px (Jellyfin's web client is ~215). */
export const POSTER_WIDTH = readPosterWidth(process.env.NEXT_PUBLIC_POSTER_WIDTH);

/**
 * CSS-only poster grids (skeletons, collections) auto-fill columns at 92% of
 * the target, so posters land near POSTER_WIDTH without JS.
 */
export const POSTER_GRID_MIN = Math.round(POSTER_WIDTH * 0.92);

/**
 * Column count for JS-measured poster grids (the library): the count whose
 * resulting poster width is closest to POSTER_WIDTH (min 2), so posters stay
 * within a few percent of the target at any screen size.
 */
export function posterColumns(width: number, gap: number, posterWidth = POSTER_WIDTH): number {
  return Math.max(2, Math.round((width + gap) / (posterWidth + gap)));
}

/** `sizes` for fixed-width poster cards (rows). */
export const POSTER_SIZES = `${POSTER_WIDTH}px`;

/**
 * `sizes` for fluid poster grids. Columns can stretch past the target when
 * only 2–3 fit (phones/tablets), so those breakpoints use viewport fractions.
 */
export const POSTER_GRID_SIZES = `(max-width: 639px) 50vw, (max-width: 1023px) 34vw, ${Math.round(POSTER_WIDTH * 1.3)}px`;

/** CSS variables published on <html> for Tailwind tokens/utilities in globals.css. */
export const uiCssVars = {
  "--poster-width": `${POSTER_WIDTH}px`,
  "--poster-grid-min": `${POSTER_GRID_MIN}px`,
} as CSSProperties;
