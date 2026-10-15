"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AxiosError } from "axios";
import { Heart, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dotJoin } from "@/lib/format";
import { useItem } from "@/lib/queries/items";
import { LIKED_ID, useDeletePlaylist, useMovePlaylistItem, usePlaylistTracks, useRemoveFromPlaylist, useRenamePlaylist } from "@/lib/queries/music";
import { usePlayer } from "@/lib/player/store";
import { MusicHeader, MusicHeaderSkeleton, totalDuration } from "./music-header";
import { TrackMenu } from "./track-menu";
import { TrackTable, TrackTableSkeleton } from "./track-table";

export function PlaylistView() {
  const { id } = useParams<{ id: string }>();
  const isLiked = id === LIKED_ID;
  const router = useRouter();
  const playlist = useItem(isLiked ? null : id);
  const tracks = usePlaylistTracks(id);
  const playItems = usePlayer((s) => s.playItems);
  const rename = useRenamePlaylist();
  const del = useDeletePlaylist();
  const remove = useRemoveFromPlaylist();
  const move = useMovePlaylistItem();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isLiked && playlist.isError) {
    const notFound = playlist.error instanceof AxiosError && (playlist.error.response?.status === 404 || playlist.error.response?.status === 400);
    return notFound ? (
      <EmptyState as="h1" title="This playlist doesn't exist" action={<Link href="/music" className="text-accent hover:underline">Back to Music</Link>} />
    ) : (
      <ErrorState as="h1" title="Couldn't load this playlist" action={<Button onClick={() => void playlist.refetch()}>Retry</Button>} />
    );
  }
  if (!isLiked && playlist.isPending) {
    return (
      <>
        <MusicHeaderSkeleton />
        <div className="px-5 sm:px-7">
          <TrackTableSkeleton />
        </div>
      </>
    );
  }

  const p = isLiked ? null : playlist.data;
  const title = isLiked ? "Liked Songs" : p?.Name ?? "Playlist";
  const list = tracks.data ?? [];
  const source = { label: title, href: `/music/playlist/${id}` };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !p?.Id) return;
    rename.mutate({ playlistId: p.Id, name: name.trim() }, { onSuccess: () => setEditing(false) });
  };

  return (
    <div className="pb-8">
      <MusicHeader
        item={p ?? undefined}
        eyebrow="Playlist"
        title={
          editing ? (
            <form onSubmit={submitRename} className="flex flex-wrap items-center gap-2">
              <label htmlFor="rename" className="sr-only">Playlist name</label>
              <input
                id="rename"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                className="min-w-0 flex-1 rounded-card border border-hairline-strong bg-bg/40 px-3 py-1 font-display text-3xl font-extrabold tracking-display focus-visible:border-accent focus-visible:outline-none sm:text-4xl"
              />
              <Button type="submit" disabled={!name.trim() || rename.isPending}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </form>
          ) : (
            title
          )
        }
        art={
          isLiked ? (
            <span className="flex size-44 shrink-0 items-center justify-center rounded-panel bg-linear-to-br from-accent to-accent/40 text-on-accent shadow-2xl shadow-black/50 sm:size-56">
              <Heart className="size-16 fill-current" aria-hidden="true" />
            </span>
          ) : undefined
        }
        meta={dotJoin(list.length ? `${list.length} song${list.length === 1 ? "" : "s"}` : tracks.isPending ? null : "No songs yet", totalDuration(list))}
        playDisabled={list.length === 0}
        onPlay={() => playItems(list, 0, source)}
        onShuffle={() => playItems(list, 0, source, { shuffle: true })}
        actions={
          <>
            {list.length > 0 && <TrackMenu tracks={list} label={title} align="left" triggerClassName="size-12" />}
            {p?.Id && !editing && (
              <IconButton aria-label="Rename playlist" variant="ghost" size="lg" onClick={() => { setName(p.Name ?? ""); setEditing(true); }}>
                <Pencil className="size-5" aria-hidden="true" />
              </IconButton>
            )}
            {p?.Id &&
              (confirmDelete ? (
                <span className="flex items-center gap-2" role="group" aria-label="Confirm delete">
                  <span className="text-sm text-text-secondary">Delete “{title}”?</span>
                  <Button
                    size="sm"
                    className="bg-danger text-bg"
                    disabled={del.isPending}
                    onClick={() => p.Id && del.mutate(p.Id, { onSuccess: () => router.push("/music") })}
                  >
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </span>
              ) : (
                <IconButton aria-label="Delete playlist" variant="ghost" size="lg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-5" aria-hidden="true" />
                </IconButton>
              ))}
          </>
        }
      />
      {(rename.isError || del.isError || remove.isError || move.isError) && (
        <p role="alert" className="px-7 pb-3 text-sm text-danger">Couldn&apos;t update the playlist. Try again.</p>
      )}
      <div className="px-3 sm:px-5">
        {tracks.isPending && <TrackTableSkeleton />}
        {tracks.isError && <ErrorState title="Couldn't load songs" action={<Button onClick={() => void tracks.refetch()}>Retry</Button>} />}
        {tracks.data?.length === 0 && (
          <EmptyState
            title={isLiked ? "No liked songs yet" : "This playlist is empty"}
            description={isLiked ? "Tap ♡ on any song to save it here." : "Add songs from an album or the queue with ⋯ → Add to playlist."}
          />
        )}
        {list.length > 0 && (
          <TrackTable
            tracks={list}
            source={source}
            showAlbum
            onRemove={p?.Id ? (t) => t.PlaylistItemId && remove.mutate({ playlistId: id, entryId: t.PlaylistItemId }) : undefined}
            onMove={p?.Id ? (t, newIndex) => t.PlaylistItemId && move.mutate({ playlistId: id, entryId: t.PlaylistItemId, newIndex }) : undefined}
          />
        )}
      </div>
    </div>
  );
}
