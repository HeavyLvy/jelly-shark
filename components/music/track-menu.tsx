"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Check, Disc3, ListEnd, ListPlus, ListStart, MoreHorizontal, Play, Plus, Radio, Shuffle, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FloatingMenu, menuItemCls, type MenuAnchor } from "@/components/ui/floating-menu";
import { FavoriteMenuItem } from "@/components/media/media-menu";
import { Spinner } from "@/components/ui/states";
import { usePlayer, type PlaySource } from "@/lib/player/store";
import { useAddToPlaylist, useCreatePlaylist, usePlaylists } from "@/lib/queries/playlists";
import { fetchRadio } from "@/lib/queries/music";

export { menuItemCls };

/**
 * Menu contents for one or more tracks (shared by the "⋯" button and right-click):
 * play, play next, add to queue, add to playlist, go to album/artist, remove.
 * `getTracks` may be async (e.g. resolving an album's tracks on demand).
 */
export function TrackMenuBody({
  getTracks,
  single,
  onRemove,
  onClose,
  playSource,
}: {
  getTracks: () => BaseItemDto[] | Promise<BaseItemDto[]>;
  /** The item the menu is about (for "Go to album/artist"). */
  single?: BaseItemDto | null;
  onRemove?: () => void;
  onClose: () => void;
  /** When set, the menu also offers Play / Shuffle. */
  playSource?: PlaySource;
}) {
  const [view, setView] = useState<"main" | "playlists">("main");
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const playlists = usePlaylists("Audio", view === "playlists");
  const add = useAddToPlaylist();
  const create = useCreatePlaylist();

  const withTracks = async (fn: (tracks: BaseItemDto[]) => void) => {
    setBusy(true);
    try {
      fn(await getTracks());
    } finally {
      setBusy(false);
    }
  };
  const run = (fn: (tracks: BaseItemDto[]) => void) => () => void withTracks(fn).then(onClose);
  const ids = async () => (await getTracks()).map((t) => t.Id).filter((x): x is string => !!x);

  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const trackIds = await ids();
    create.mutate({ name: name.trim(), ids: trackIds, mediaType: "Audio" }, { onSuccess: () => { setDone(name.trim()); setName(""); } });
  };

  const albumId = single?.Type === "Audio" ? single.AlbumId : null;
  const artist = single?.Type === "MusicArtist" ? null : single?.ArtistItems?.[0] ?? single?.AlbumArtists?.[0];

  if (view === "playlists") {
    return (
      <>
        <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Add to playlist</p>
        {playlists.isPending && <Spinner className="m-3 size-4" />}
        {playlists.isError && <p className="px-3 py-2 text-sm text-danger">Couldn&apos;t load playlists.</p>}
        {playlists.data?.map((p) => (
          <button
            key={p.Id}
            type="button"
            role="menuitem"
            disabled={add.isPending}
            className={menuItemCls}
            onClick={() => void ids().then((trackIds) => p.Id && add.mutate({ playlistId: p.Id, ids: trackIds }, { onSuccess: () => setDone(p.Name ?? "playlist") }))}
          >
            <ListPlus className="size-4" aria-hidden="true" />
            <span className="truncate">{p.Name}</span>
          </button>
        ))}
        <form onSubmit={(e) => void submitNew(e)} className="flex gap-2 p-2">
          <label className="sr-only" htmlFor={`${id}-new`}>New playlist name</label>
          <input
            id={`${id}-new`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist"
            className="h-9 min-w-0 flex-1 rounded-full border border-hairline-strong bg-bg/40 px-3 text-sm text-text placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
          />
          <Button type="submit" size="sm" disabled={create.isPending || !name.trim()} aria-label="Create playlist">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </form>
        <p role="status" className="px-3 pb-1 text-xs text-accent">
          {done && (<><Check className="mr-1 inline size-3.5" aria-hidden="true" />Added to {done}</>)}
        </p>
        {(add.isError || create.isError) && <p role="alert" className="px-3 pb-2 text-xs text-danger">Couldn&apos;t update the playlist.</p>}
      </>
    );
  }

  return (
    <>
      {playSource && (
        <>
          <button type="button" role="menuitem" disabled={busy} className={menuItemCls} onClick={run((t) => usePlayer.getState().playItems(t, 0, playSource))}>
            <Play className="size-4" aria-hidden="true" /> Play
          </button>
          <button type="button" role="menuitem" disabled={busy} className={menuItemCls} onClick={run((t) => usePlayer.getState().playItems(t, 0, playSource, { shuffle: true }))}>
            <Shuffle className="size-4" aria-hidden="true" /> Shuffle
          </button>
        </>
      )}
      <button type="button" role="menuitem" disabled={busy} className={menuItemCls} onClick={run((t) => usePlayer.getState().playNext(t))}>
        <ListStart className="size-4" aria-hidden="true" /> Play next
      </button>
      <button type="button" role="menuitem" disabled={busy} className={menuItemCls} onClick={run((t) => usePlayer.getState().addToQueue(t))}>
        <ListEnd className="size-4" aria-hidden="true" /> Add to queue
      </button>
      <button type="button" role="menuitem" className={menuItemCls} onClick={() => setView("playlists")}>
        <ListPlus className="size-4" aria-hidden="true" /> Add to playlist…
      </button>
      {single?.Id && <FavoriteMenuItem item={single} onDone={onClose} />}
      {single?.Id && (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          className={menuItemCls}
          onClick={async () => {
            setBusy(true);
            try {
              const mix = await fetchRadio(single);
              if (mix.length) usePlayer.getState().playItems(mix, 0, { label: `${single.Name ?? "Song"} radio` });
            } finally {
              setBusy(false);
              onClose();
            }
          }}
        >
          <Radio className="size-4" aria-hidden="true" /> Start radio
        </button>
      )}
      {albumId && (
        <Link role="menuitem" href={`/music/album/${albumId}`} className={menuItemCls} onClick={onClose}>
          <Disc3 className="size-4" aria-hidden="true" /> Go to album
        </Link>
      )}
      {artist?.Id && (
        <Link role="menuitem" href={`/music/artist/${artist.Id}`} className={menuItemCls} onClick={onClose}>
          <User className="size-4" aria-hidden="true" /> Go to artist
        </Link>
      )}
      {onRemove && (
        <>
          <div role="separator" className="my-1 h-px bg-hairline" />
          <button type="button" role="menuitem" className={cn(menuItemCls, "hover:text-danger")} onClick={() => { onRemove(); onClose(); }}>
            <Trash2 className="size-4" aria-hidden="true" /> Remove from this playlist
          </button>
        </>
      )}
      {busy && <Spinner className="mx-3 my-1 size-4" label="Working" />}
    </>
  );
}

/** "⋯" button that opens the track menu below it. */
export function TrackMenu({
  tracks,
  label,
  onRemove,
  align = "right",
  triggerClassName,
}: {
  tracks: BaseItemDto[];
  label: string;
  onRemove?: () => void;
  align?: "left" | "right";
  triggerClassName?: string;
}) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = (opts?: { restoreFocus?: boolean }) => {
    setAnchor(null);
    if (opts?.restoreFocus) btnRef.current?.focus();
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`More options for ${label}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? id : undefined}
        onClick={() => {
          if (anchor) return setAnchor(null);
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setAnchor({ x: align === "right" ? r.right : r.left, y: r.bottom + 4, align });
        }}
        className={cn("inline-flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-overlay hover:text-text", triggerClassName)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {anchor && (
        <FloatingMenu anchor={anchor} onClose={close} label={label} id={id} triggerRef={btnRef}>
          <TrackMenuBody getTracks={() => tracks} single={tracks.length === 1 ? tracks[0] : null} onRemove={onRemove} onClose={() => close()} />
        </FloatingMenu>
      )}
    </>
  );
}
