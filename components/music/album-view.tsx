"use client";

import { MusicAlbumCard } from "./music-cards";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AxiosError } from "axios";
import { AlbumCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { LikeButton } from "@/components/player/track-bits";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dotJoin } from "@/lib/format";
import { useItem } from "@/lib/queries/items";
import { useAlbumTracks, useArtistAlbums } from "@/lib/queries/music";
import { usePlayer } from "@/lib/player/store";
import { MusicHeader, MusicHeaderSkeleton, totalDuration } from "./music-header";
import { TrackMenu } from "./track-menu";
import { TrackTable, TrackTableSkeleton } from "./track-table";

export function AlbumView() {
  const { id } = useParams<{ id: string }>();
  const album = useItem(id);
  const tracks = useAlbumTracks(id);
  const playItems = usePlayer((s) => s.playItems);

  if (album.isError) {
    const notFound = album.error instanceof AxiosError && (album.error.response?.status === 404 || album.error.response?.status === 400);
    return notFound ? (
      <EmptyState as="h1" title="This album isn't in your library" action={<Link href="/music" className="text-accent hover:underline">Back to Music</Link>} />
    ) : (
      <ErrorState as="h1" title="Couldn't load this album" action={<Button onClick={() => void album.refetch()}>Retry</Button>} />
    );
  }
  if (album.isPending) {
    return (
      <>
        <MusicHeaderSkeleton />
        <div className="px-5 sm:px-7">
          <TrackTableSkeleton />
        </div>
      </>
    );
  }

  const a = album.data;
  const list = tracks.data ?? [];
  const artist = a.AlbumArtists?.[0];
  const source = { label: a.Name ?? "Album", href: `/music/album/${id}` };

  return (
    <div className="pb-8">
      <MusicHeader
        item={a}
        eyebrow="Album"
        title={a.Name ?? "Album"}
        playDisabled={list.length === 0}
        meta={
          <>
            {artist?.Id ? (
              <Link href={`/music/artist/${artist.Id}`} className="font-semibold text-text hover:underline">
                {artist.Name}
              </Link>
            ) : (
              <span className="font-semibold text-text">{a.AlbumArtist}</span>
            )}
            {" · "}
            {dotJoin(a.ProductionYear, list.length ? `${list.length} song${list.length === 1 ? "" : "s"}` : null, totalDuration(list))}
          </>
        }
        onPlay={() => playItems(list, 0, source)}
        onShuffle={() => playItems(list, 0, source, { shuffle: true })}
        actions={
          <>
            <LikeButton item={a} className="size-12" />
            {list.length > 0 && <TrackMenu tracks={list} label={a.Name ?? "album"} align="left" triggerClassName="size-12" />}
          </>
        }
      />
      <div className="px-3 sm:px-5">
        {tracks.isPending && <TrackTableSkeleton />}
        {tracks.isError && <ErrorState title="Couldn't load tracks" action={<Button onClick={() => void tracks.refetch()}>Retry</Button>} />}
        {tracks.data?.length === 0 && <EmptyState title="This album has no tracks" />}
        {list.length > 0 && <TrackTable tracks={list} source={source} numbering="track" showArt={false} />}
      </div>
      {artist?.Id && <MoreByArtist artistId={artist.Id} name={artist.Name ?? "this artist"} exclude={id} />}
    </div>
  );
}

function MoreByArtist({ artistId, name, exclude }: { artistId: string; name: string; exclude: string }) {
  const albums = useArtistAlbums(artistId);
  const others = albums.data?.filter((a) => a.Id !== exclude) ?? [];
  if (albums.isError || (albums.data && others.length === 0)) return null;
  return (
    <MediaRow title={`More by ${name}`} seeAllHref={`/music/artist/${artistId}`} className="mt-10">
      {albums.isPending
        ? Array.from({ length: 5 }, (_, i) => (
            <RowItem key={i}>
              <AlbumCardSkeleton />
            </RowItem>
          ))
        : others.map((al) => (
            <RowItem key={al.Id}>
              <MusicAlbumCard item={al} subtitle={al.ProductionYear ? String(al.ProductionYear) : "Album"} />
            </RowItem>
          ))}
    </MediaRow>
  );
}
