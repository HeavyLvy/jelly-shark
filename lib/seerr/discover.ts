import type { SeerrDiscoverKind } from "./types";

/** The Discover rows, in order, with their headings. Each can also be opened as a full page. */
export const DISCOVER_ROWS: { kind: SeerrDiscoverKind; title: string; subtitle: string }[] = [
  { kind: "trending", title: "Trending", subtitle: "What people are watching this week" },
  { kind: "movies", title: "Popular Movies", subtitle: "Ask for anything that isn't in your library yet" },
  { kind: "tv", title: "Popular Shows", subtitle: "Ask for anything that isn't in your library yet" },
  { kind: "upcoming-movies", title: "Upcoming Movies", subtitle: "Coming soon" },
  { kind: "upcoming-tv", title: "Upcoming Shows", subtitle: "Coming soon" },
];

export function discoverRow(kind: string) {
  return DISCOVER_ROWS.find((r) => r.kind === kind) ?? null;
}
