"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Heart, LibraryBig, Plus, Search, X } from "lucide-react";
import { JfImage } from "@/components/media/jf-image";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { SelectMenu } from "@/components/ui/select-menu";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { pickImage } from "@/lib/jellyfin/images";
import { LIKED_ID, useMusicPlaylists, usePlayedAlbums, useTopArtists } from "@/lib/queries/music";
import { useCreatePlaylist } from "@/lib/queries/playlists";
import { useMusicItemMenu } from "./music-cards";

type Kind = "playlists" | "albums" | "artists";

interface Entry {
  id: string;
  href: string;
  name: string;
  sub: string;
  kind: Kind;
  item: BaseItemDto | null;
}

function toEntry(item: BaseItemDto, kind: Kind): Entry {
  const id = item.Id ?? "";
  if (kind === "playlists") return { id, kind, item, name: item.Name ?? "Playlist", href: `/music/playlist/${id}`, sub: `Playlist · ${item.ChildCount ?? 0} songs` };
  if (kind === "albums") return { id, kind, item, name: item.Name ?? "Album", href: `/music/album/${id}`, sub: `Album · ${item.AlbumArtist ?? "Various artists"}` };
  return { id, kind, item, name: item.Name ?? "Artist", href: `/music/artist/${id}`, sub: "Artist" };
}

/** Left music panel: "Your Library" with type filters, search, and a recents list (Liked Songs first). */
export function LibrarySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [order, setOrder] = useState<"recents" | "alpha">("recents");
  const playlists = useMusicPlaylists();
  const albums = usePlayedAlbums(30);
  const artists = useTopArtists(30);
  const create = useCreatePlaylist();

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...(playlists.data ?? []).map((p) => toEntry(p, "playlists")),
      ...(albums.data ?? []).map((a) => toEntry(a, "albums")),
      ...(artists.data ?? []).map((a) => toEntry(a, "artists")),
    ];
    const q = query.trim().toLowerCase();
    const shown = all.filter((e) => (!kind || e.kind === kind) && (!q || e.name.toLowerCase().includes(q)));
    return order === "alpha" ? [...shown].sort((x, y) => x.name.localeCompare(y.name)) : shown;
  }, [playlists.data, albums.data, artists.data, kind, query, order]);

  const loading = playlists.isPending || albums.isPending || artists.isPending;
  const failed = playlists.isError && albums.isError && artists.isError;
  const showLiked = (!kind || kind === "playlists") && (!query || "liked songs".includes(query.trim().toLowerCase()));

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    create.mutate(
      { name: newName.trim(), ids: [], mediaType: "Audio" },
      {
        onSuccess: (res) => {
          setCreating(false);
          setNewName("");
          if (res.Id) router.push(`/music/playlist/${res.Id}`);
        },
      },
    );
  };

  return (
    <nav aria-label="Your library" className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <LibraryBig className="size-5 text-text-secondary" aria-hidden="true" /> Your Library
        </h2>
        <button
          type="button"
          aria-label="Create playlist"
          aria-expanded={creating}
          onClick={() => setCreating((c) => !c)}
          className="inline-flex size-8 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      {creating && (
        <form onSubmit={submitNew} className="flex gap-2 px-4 pt-3">
          <label htmlFor="new-playlist" className="sr-only">Playlist name</label>
          <input
            id="new-playlist"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Playlist name"
            className="h-9 min-w-0 flex-1 rounded-full border border-hairline-strong bg-bg/40 px-3 text-sm placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
          />
          <button type="submit" disabled={!newName.trim() || create.isPending} className="rounded-full bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-50">
            Create
          </button>
        </form>
      )}
      <div className="flex gap-2 px-4 pt-3" role="group" aria-label="Filter library">
        {(["playlists", "albums", "artists"] as const).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)} className="h-8 px-3 text-xs capitalize">
            {k}
          </Chip>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        {searching ? (
          <div className="flex flex-1 items-center gap-2">
            <label htmlFor="lib-search" className="sr-only">Search your library</label>
            <input
              id="lib-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in Your Library"
              className="h-8 min-w-0 flex-1 rounded-full bg-bg/40 px-3 text-sm placeholder:text-muted focus-visible:outline-none"
            />
            <button type="button" aria-label="Close search" onClick={() => { setSearching(false); setQuery(""); }} className="text-muted hover:text-text">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="button" aria-label="Search your library" onClick={() => setSearching(true)} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <Search className="size-4" aria-hidden="true" />
          </button>
        )}
        {!searching && (
          <SelectMenu
            value={order}
            options={[
              { value: "recents", label: "Recents" },
              { value: "alpha", label: "Alphabetical" },
            ]}
            onChange={setOrder}
            label="Sort Your Library by"
            size="sm"
            className="[&>button]:h-7 [&>button]:border-transparent [&>button]:bg-transparent [&>button]:shadow-none [&>button]:text-muted"
          />
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {showLiked && (
          <SidebarRow
            href={`/music/playlist/${LIKED_ID}`}
            active={pathname === `/music/playlist/${LIKED_ID}`}
            name="Liked Songs"
            sub="Playlist"
            menuItem={{ Id: LIKED_ID, Type: "Liked", Name: "Liked Songs" }}
            art={
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[6px] bg-accent text-on-accent">
                <Heart className="size-5 fill-current" aria-hidden="true" />
              </span>
            }
          />
        )}
        {loading &&
          Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2" aria-hidden="true">
              <Skeleton tone="raised" className="size-12" />
              <div className="flex-1 space-y-1.5">
                <Skeleton tone="raised" className="h-3.5 w-2/3" />
                <Skeleton tone="raised" className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        {failed && <ErrorState title="Couldn't load your library" className="py-8" />}
        {!loading && entries.length === 0 && !showLiked && <li className="px-3 py-6 text-sm text-muted">Nothing matches.</li>}
        {entries.map((e) => (
          <SidebarRow
            key={`${e.kind}-${e.id}`}
            href={e.href}
            active={pathname === e.href}
            name={e.name}
            sub={e.sub}
            menuItem={e.item ?? undefined}
            art={
              <JfImage
                image={e.item ? pickImage(e.item, "square") : null}
                alt=""
                sizes="48px"
                className={cn("size-12 shrink-0 bg-surface-raised", e.kind === "artists" ? "rounded-full" : "rounded-[6px]")}
                fallback={<span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-muted">{e.name.charAt(0)}</span>}
              />
            }
          />
        ))}
      </ul>
    </nav>
  );
}

function SidebarRow({
  href,
  active,
  name,
  sub,
  art,
  menuItem,
}: {
  href: string;
  active: boolean;
  name: string;
  sub: string;
  art: React.ReactNode;
  menuItem?: Parameters<typeof useMusicItemMenu>[0];
}) {
  const { onContextMenu, menu } = useMusicItemMenu(menuItem ?? { Id: LIKED_ID, Type: "Liked", Name: name });
  return (
    <li>
      {menuItem && menu}
      <Link
        href={href}
        onContextMenu={menuItem ? onContextMenu : undefined}
        aria-current={active ? "page" : undefined}
        className={cn("flex items-center gap-3 rounded-card px-2 py-1.5 transition hover:bg-overlay", active && "bg-overlay-strong")}
      >
        {art}
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-medium", active ? "text-accent" : "text-text")}>{name}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
      </Link>
    </li>
  );
}
