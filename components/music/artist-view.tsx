"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AxiosError } from "axios";
import { AlbumCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { LikeButton } from "@/components/player/track-bits";
import { Radio } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useItem } from "@/lib/queries/items";
import { fetchArtistTracks, fetchRadio, useArtistAlbums, useArtistLikedTracks, useArtistTopTracks, useSimilarArtists } from "@/lib/queries/music";
import { usePlayer } from "@/lib/player/store";
import { ArtistCardSkeleton, MusicAlbumCard, MusicArtistCard } from "./music-cards";
import { MusicHeader, MusicHeaderSkeleton } from "./music-header";
import { TrackTable, TrackTableSkeleton } from "./track-table";

export function ArtistView() {
  const { id } = useParams<{ id: string }>();
  const artist = useItem(id);
  const top = useArtistTopTracks(id, 10);
  const albums = useArtistAlbums(id);
  const liked = useArtistLikedTracks(id);
  const similar = useSimilarArtists(id);
  const playItems = usePlayer((s) => s.playItems);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (artist.isError) {
    const notFound = artist.error instanceof AxiosError && (artist.error.response?.status === 404 || artist.error.response?.status === 400);
    return notFound ? (
      <EmptyState as="h1" title="This artist isn't in your library" action={<Link href="/music" className="text-accent hover:underline">Back to Music</Link>} />
    ) : (
      <ErrorState as="h1" title="Couldn't load this artist" action={<Button onClick={() => void artist.refetch()}>Retry</Button>} />
    );
  }
  if (artist.isPending) {
    return (
      <>
        <MusicHeaderSkeleton round />
        <div className="px-5 sm:px-7">
          <TrackTableSkeleton rows={5} />
        </div>
      </>
    );
  }

  const a = artist.data;
  const source = { label: a.Name ?? "Artist", href: `/music/artist/${id}` };
  const playAll = async (shuffle: boolean) => {
    setBusy(true);
    try {
      const tracks = await fetchArtistTracks(id);
      playItems(tracks, 0, source, { shuffle });
    } finally {
      setBusy(false);
    }
  };
  const topTracks = top.data ?? [];
  const albumCount = albums.data?.length ?? 0;

  return (
    <div className="pb-8">
      <MusicHeader
        item={a}
        round
        eyebrow="Artist"
        title={a.Name ?? "Artist"}
        meta={albums.data ? `${albumCount} album${albumCount === 1 ? "" : "s"} in your library` : undefined}
        playDisabled={busy}
        onPlay={() => void playAll(false)}
        onShuffle={() => void playAll(true)}
        actions={
          <>
            <IconButton
              aria-label={`${a.Name ?? "Artist"} radio`}
              title="Artist radio"
              variant="ghost"
              size="lg"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const mix = await fetchRadio(a);
                    if (mix.length) playItems(mix, 0, { label: `${a.Name ?? "Artist"} radio`, href: source.href });
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <Radio className="size-5" aria-hidden="true" />
            </IconButton>
            <LikeButton item={a} className="size-12" />
          </>
        }
      />
      <section aria-label="Popular" className="px-3 sm:px-5">
        <h2 className="mb-3 px-2 font-display text-xl font-bold tracking-tight sm:text-[22px]">Popular</h2>
        {top.isPending && <TrackTableSkeleton rows={5} />}
        {top.isError && <ErrorState title="Couldn't load songs" />}
        {top.data?.length === 0 && <EmptyState title="No songs by this artist" className="py-6" />}
        {topTracks.length > 0 && (
          <>
            <TrackTable tracks={showAll ? topTracks : topTracks.slice(0, 5)} source={source} showAlbum />
            {topTracks.length > 5 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 px-3 text-sm font-semibold text-text-secondary hover:text-text">
                {showAll ? "Show less" : "See more"}
              </button>
            )}
          </>
        )}
      </section>
      {/* Only for artists you've hearted songs of; shows nothing (not even a heading) otherwise. */}
      {(liked.data?.length ?? 0) > 0 && (
        <section aria-labelledby="liked-by-artist" className="mt-10 px-3 sm:px-5">
          <h2 id="liked-by-artist" className="mb-3 px-2 font-display text-xl font-bold tracking-tight sm:text-[22px]">
            Liked songs
            <span className="ml-2 text-sm font-medium text-muted">{liked.data?.length}</span>
          </h2>
          <TrackTable tracks={liked.data ?? []} source={{ label: `Liked songs by ${a.Name ?? "this artist"}`, href: source.href }} showAlbum />
        </section>
      )}
      {(albums.isPending || albumCount > 0) && (
        <MediaRow title="Discography" className="mt-10">
          {albums.isPending
            ? Array.from({ length: 5 }, (_, i) => (
                <RowItem key={i}>
                  <AlbumCardSkeleton />
                </RowItem>
              ))
            : (albums.data ?? []).map((al) => (
                <RowItem key={al.Id}>
                  <MusicAlbumCard item={al} subtitle={al.ProductionYear ? `${al.ProductionYear} · Album` : "Album"} />
                </RowItem>
              ))}
        </MediaRow>
      )}
      {(similar.isPending || (similar.data?.length ?? 0) > 0) && (
        <MediaRow title="Fans also like" className="mt-10">
          {similar.isPending
            ? Array.from({ length: 5 }, (_, i) => (
                <RowItem key={i}>
                  <ArtistCardSkeleton />
                </RowItem>
              ))
            : (similar.data ?? []).map((s) => (
                <RowItem key={s.Id}>
                  <MusicArtistCard item={s} />
                </RowItem>
              ))}
        </MediaRow>
      )}
    </div>
  );
}
