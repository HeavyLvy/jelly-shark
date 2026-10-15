"use client";

import Link from "next/link";
import { Music2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { ArtistLinks, LikeButton, TrackArt } from "@/components/player/track-bits";
import { useArtistAlbums, useArtistTopTracks } from "@/lib/queries/music";
import { currentTrack, usePlayer } from "@/lib/player/store";

/** Right music panel: what's playing, the artist in your library, and what's next. */
export function NowPlayingPanel() {
  const track = usePlayer(currentTrack);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const setPanel = usePlayer((s) => s.setPanel);
  const artist = track?.ArtistItems?.[0] ?? track?.AlbumArtists?.[0];

  if (!track) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Music2 className="size-10 text-muted" aria-hidden="true" />
        <p className="font-display text-lg font-bold">Nothing playing</p>
        <p className="text-sm text-muted">Pick an album, playlist or mix to start listening.</p>
      </div>
    );
  }

  const upNext = queue.slice(index + 1, index + 5);

  return (
    <section aria-label="Now playing" className="flex h-full flex-col overflow-y-auto p-4">
      <div className="flex items-baseline justify-between gap-2 pb-3">
        <h2 className="truncate font-display text-base font-bold">{track.Album ?? "Now playing"}</h2>
        {source && (
          <span className="shrink-0 text-xs text-muted">
            Playing from{" "}
            {source.href ? (
              <Link href={source.href} className="hover:text-text hover:underline">
                {source.label}
              </Link>
            ) : (
              source.label
            )}
          </span>
        )}
      </div>
      <TrackArt item={track} size={320} className="aspect-square w-full rounded-panel shadow-xl shadow-black/40" />
      <div className="mt-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-bold tracking-tight">{track.Name}</p>
          <ArtistLinks item={track} className="block truncate text-sm text-muted" />
        </div>
        <LikeButton item={track} />
      </div>
      {artist?.Id && <ArtistCardInLibrary artistId={artist.Id} name={artist.Name ?? ""} />}
      <div className="mt-6 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Next in queue</h3>
        <button type="button" onClick={() => setPanel("queue")} className="text-xs text-muted hover:text-text hover:underline">
          Open queue
        </button>
      </div>
      {upNext.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing queued.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {upNext.map((q, i) => (
            <li key={q.uid}>
              <button type="button" onClick={() => usePlayer.getState().jumpTo(index + 1 + i)} className="flex w-full items-center gap-3 rounded-card p-1.5 text-left transition hover:bg-overlay">
                <TrackArt item={q} size={40} className="size-10" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{q.Name}</span>
                  <span className="block truncate text-xs text-muted">{q.Artists?.join(", ") || q.AlbumArtist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ArtistCardInLibrary({ artistId, name }: { artistId: string; name: string }) {
  const albums = useArtistAlbums(artistId);
  const top = useArtistTopTracks(artistId, 1);
  const plays = top.data?.[0]?.UserData?.PlayCount ?? 0;
  return (
    <div className="jelly-flat mt-5 rounded-panel p-4">
      <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">In your library</p>
      <p className="mt-1 font-semibold">{name}</p>
      <p className="mt-1 text-sm text-text-secondary">
        {albums.data ? `${albums.data.length} album${albums.data.length === 1 ? "" : "s"}` : "…"}
        {top.data?.[0] && plays > 0 ? ` · Most played: ${top.data[0].Name}` : ""}
      </p>
      <Link href={`/music/artist/${artistId}`} className={buttonClasses({ variant: "outline", size: "sm", className: "mt-3" })}>
        Go to artist
      </Link>
    </div>
  );
}
