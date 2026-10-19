import { rankEntries, toEntry } from "@/lib/search-fuzzy";

/** Something in the app itself (a page, a setting, a dialog) that Search can jump to. */
export interface AppPage {
  id: string;
  label: string;
  /** What kind of thing it is, shown under the name. */
  kind: "Page" | "Setting" | "Action";
  /** Other words people might type for it. */
  keywords: string[];
  href?: string;
  /** Opens a dialog instead of navigating. */
  action?: "shortcuts" | "quick-connect";
  /** Only offered to Jellyfin administrators. */
  adminOnly?: boolean;
}

export const APP_PAGES: AppPage[] = [
  { id: "home", label: "Home", kind: "Page", keywords: ["start", "continue watching", "recommended"], href: "/" },
  { id: "library", label: "Library", kind: "Page", keywords: ["browse", "all media"], href: "/library" },
  { id: "movies", label: "Movies", kind: "Page", keywords: ["films", "film library"], href: "/library?type=movies" },
  { id: "tv", label: "TV Shows", kind: "Page", keywords: ["series", "television", "episodes"], href: "/library?type=tv" },
  { id: "collections", label: "Collections", kind: "Page", keywords: ["box sets", "franchises"], href: "/library?type=collections" },
  { id: "fav-movies", label: "Favorite movies", kind: "Page", keywords: ["favorites", "favourites", "liked", "hearted"], href: "/library?type=movies&filters=favorites" },
  { id: "fav-shows", label: "Favorite shows", kind: "Page", keywords: ["favorites", "favourites", "liked", "hearted", "tv", "series"], href: "/library?type=tv&filters=favorites" },
  { id: "unwatched", label: "Unwatched movies", kind: "Page", keywords: ["not seen", "new"], href: "/library?type=movies&filters=unwatched" },
  { id: "in-progress", label: "In-progress shows", kind: "Page", keywords: ["resume", "continue", "started"], href: "/library?type=tv&filters=inprogress" },
  { id: "history", label: "Watch history", kind: "Page", keywords: ["recently watched", "played", "seen"], href: "/history" },
  { id: "music", label: "Music", kind: "Page", keywords: ["songs", "albums", "artists", "player"], href: "/music" },
  { id: "music-search", label: "Search music", kind: "Page", keywords: ["songs", "artists", "albums"], href: "/music/search" },
  { id: "music-library", label: "Your music library", kind: "Page", keywords: ["playlists", "albums", "artists"], href: "/music/library" },
  { id: "liked-songs", label: "Liked Songs", kind: "Page", keywords: ["favorites", "favourites", "hearted", "music"], href: "/music/playlist/liked" },
  { id: "settings", label: "Settings", kind: "Page", keywords: ["preferences", "options", "account"], href: "/settings" },
  { id: "playback", label: "Playback settings", kind: "Setting", keywords: ["quality", "autoplay", "next episode", "speed", "skip intro", "bitrate"], href: "/settings#playback" },
  { id: "languages", label: "Audio & subtitle languages", kind: "Setting", keywords: ["language", "default audio", "default subtitles"], href: "/settings#languages" },
  { id: "subtitles", label: "Subtitle appearance", kind: "Setting", keywords: ["captions", "subtitle size", "subtitle style", "font"], href: "/settings#subtitle-appearance" },
  { id: "appearance", label: "Appearance", kind: "Setting", keywords: ["poster size", "theme", "look"], href: "/settings#appearance" },
  { id: "devices", label: "Devices", kind: "Setting", keywords: ["sessions", "signed in", "quick connect"], href: "/settings#devices" },
  { id: "home-rows", label: "Home page rows", kind: "Setting", keywords: ["hide rows", "most popular", "customize home"], href: "/settings#home" },
  { id: "server", label: "Jellyfin server address", kind: "Setting", keywords: ["url", "connection", "host"], href: "/settings", adminOnly: true },
  { id: "branding", label: "Branding", kind: "Setting", keywords: ["name", "icon", "logo", "accent", "color", "colour", "theme"], href: "/settings", adminOnly: true },
  { id: "shortcuts", label: "Keyboard shortcuts & gestures", kind: "Action", keywords: ["hotkeys", "keys", "help", "controls", "swipe"], action: "shortcuts" },
  { id: "approve", label: "Approve a device", kind: "Action", keywords: ["quick connect", "sign in another device", "code", "tv login"], action: "quick-connect" },
  { id: "add-profile", label: "Add profile", kind: "Action", keywords: ["switch user", "another account", "sign in"], href: "/login?add=1" },
];

/** Pages whose name or keywords match `term`, best first. */
export function matchPages(term: string, isAdmin: boolean, limit = 6): AppPage[] {
  const pool = APP_PAGES.filter((p) => isAdmin || !p.adminOnly);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const entries = pool.map((p) => toEntry(p.id, p.label, null, p.keywords.join(" ")));
  return rankEntries(entries, term, limit).flatMap((e) => byId.get(e.id) ?? []);
}
