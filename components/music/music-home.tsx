"use client";

import Link from "next/link";
import { useState, type MouseEventHandler, type ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Heart, Play } from "lucide-react";
import { AlbumCardSkeleton } from "@/components/media/cards";
import { JfImage } from "@/components/media/jf-image";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { SelectMenu } from "@/components/ui/select-menu";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/states";
import { pickImage } from "@/lib/jellyfin/images";
import { useMe } from "@/lib/queries/auth";
import { LIKED_ID, fetchArtistMix, useMostPlayedTracks, useMusicPlaylists, usePlayedAlbums, useRecentAlbums, useTopArtists, useAlbumsSorted, useArtistsSorted, ALBUM_SORTS, ARTIST_SORTS, type AlbumSort, type ArtistSort } from "@/lib/queries/music";
import { usePlayer } from "@/lib/player/store";
import { useNow } from "@/lib/use-now";
import { ArtistCardSkeleton, MusicAlbumCard, MusicArtistCard, useMusicItemMenu } from "./music-cards";
import { EqualizerIcon, TrackTable, TrackTableSkeleton } from "./track-table";
import { useScrolledPast } from "./use-scrolled-past";

type Filter = "all" | "albums" | "artists" | "playlists";

function greeting(now: Date | null): string {
  if (!now) return "Welcome back";
  const h = now.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Music home (mockup 04 center panel). */
export function MusicHome() {
  const [filter, setFilter] = useState<Filter>("all");
  const me = useMe();
  const now = useNow();
  const name = me.data?.user.name;
  const [sentinel, stuck] = useScrolledPast<HTMLDivElement>();

  return (
    <div className="relative pb-8">
      {/* Accent wash behind the top of the page (kept separate so the chips can stick for the whole page). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] rounded-t-panel bg-linear-to-b from-accent/20 to-accent/0" />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {/* Spotify-style sticky filter row: transparent at the top, jelly glass once content scrolls under it. */}
      <div className={cn("sticky top-0 z-20 -mt-px px-5 py-3 transition-[background,box-shadow] sm:px-7", stuck ? "jelly rounded-t-panel border-x-0 border-t-0" : "border-b border-transparent")}>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 scrollbar-none [&>*]:shrink-0" role="group" aria-label="Show">
          {(["all", "albums", "artists", "playlists"] as const).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="h-8 px-4 text-xs capitalize">
              {f}
            </Chip>
          ))}
        </div>
      </div>
      <header className="relative px-5 pt-2 pb-6 sm:px-7">
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-display sm:text-4xl">
          {greeting(now)}
          {name ? `, ${name}` : ""}
        </h1>
        {filter === "all" && <QuickPicks />}
      </header>
      <div className="relative space-y-10 pt-2">
        {filter === "all" && (
          <>
            <MadeForYou name={name} />
            <MostPlayed />
            <RecentAlbumsRow />
            <TopArtistsRow />
          </>
        )}
        {filter === "albums" && <AlbumGrid />}
        {filter === "artists" && <ArtistGrid />}
        {filter === "playlists" && <PlaylistGrid />}
      </div>
    </div>
  );
}

/* ---------- quick picks (2 × 4 tiles) ---------- */

function QuickPicks() {
  const playlists = useMusicPlaylists();
  const albums = usePlayedAlbums(8);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);
  const tiles: { href: string; name: string; item: BaseItemDto | null }[] = [
    { href: `/music/playlist/${LIKED_ID}`, name: "Liked Songs", item: null },
    ...(playlists.data ?? []).slice(0, 3).map((p) => ({ href: `/music/playlist/${p.Id}`, name: p.Name ?? "Playlist", item: p })),
    ...(albums.data ?? []).map((a) => ({ href: `/music/album/${a.Id}`, name: a.Name ?? "Album", item: a })),
  ].slice(0, 8);

  if (playlists.isPending || albums.isPending) {
    return (
      <div className="mt-5 grid grid-cols-2 gap-2" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} tone="raised" className="h-14" />
        ))}
      </div>
    );
  }
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2">
      {tiles.map((t) => {
        const active = source?.href === t.href;
        return (
          <QuickPickTile key={t.href} item={t.item} name={t.name}>
            {(onContextMenu) => (
            <Link href={t.href} onContextMenu={onContextMenu} className="jelly-control group flex h-14 items-center gap-3 overflow-hidden rounded-card pr-3">
              {t.item ? (
                <JfImage image={pickImage(t.item, "square")} alt="" sizes="56px" className="size-14 shrink-0 bg-surface-raised" fallback={<span className="absolute inset-0 flex items-center justify-center font-bold text-muted">{t.name.charAt(0)}</span>} />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center bg-accent text-on-accent">
                  <Heart className="size-5 fill-current" aria-hidden="true" />
                </span>
              )}
              <span className={cn("line-clamp-2 min-w-0 flex-1 text-[13px] leading-tight font-semibold break-words sm:line-clamp-1 sm:text-sm", active && "text-accent")}>{t.name}</span>
              {active && <EqualizerIcon playing={playing} />}
            </Link>
            )}
          </QuickPickTile>
        );
      })}
    </ul>
  );
}

/** Quick-pick list item with a right-click menu for its album/playlist (or Liked Songs). */
function QuickPickTile({ item, name, children }: { item: BaseItemDto | null; name: string; children: (onContextMenu: MouseEventHandler) => ReactNode }) {
  const { onContextMenu, menu } = useMusicItemMenu(item ?? { Id: LIKED_ID, Type: "Liked", Name: name });
  return (
    <li>
      {children(onContextMenu)}
      {menu}
    </li>
  );
}

/* ---------- Made for you (instant mixes from top artists) ---------- */

function MadeForYou({ name }: { name?: string }) {
  const artists = useTopArtists(4);
  const playItems = usePlayer((s) => s.playItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seeds = artists.data ?? [];

  const playMix = async (artist: BaseItemDto, n: number) => {
    if (!artist.Id) return;
    setLoadingId(artist.Id);
    setError(null);
    try {
      const tracks = await fetchArtistMix(artist.Id);
      if (tracks.length === 0) setError(`No mix available for ${artist.Name}.`);
      else playItems(tracks, 0, { label: `Daily Mix ${n}` });
    } catch {
      setError("Couldn't build that mix.");
    } finally {
      setLoadingId(null);
    }
  };

  if (artists.isError) return <ErrorState title="Couldn't load mixes" className="py-6" />;
  return (
    <MediaRow title={`Made for ${name ?? "you"}`} subtitle="Instant mixes seeded from artists you love">
      {artists.isPending
        ? Array.from({ length: 4 }, (_, i) => (
            <RowItem key={i}>
              <AlbumCardSkeleton />
            </RowItem>
          ))
        : seeds.map((a, i) => (
            <RowItem key={a.Id}>
              <button type="button" onClick={() => void playMix(a, i + 1)} className="group block w-album text-left" aria-label={`Play Daily Mix ${i + 1}, based on ${a.Name}`}>
                <div className="relative aspect-square overflow-hidden rounded-card border-t-4 border-accent bg-surface-raised">
                  <JfImage image={pickImage(a, "square")} alt="" sizes="168px" className="absolute inset-0" imgClassName="transition duration-300 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-linear-to-t from-bg/80 via-bg/0 to-bg/0" />
                  <span className="absolute bottom-2 left-3 font-display text-xl font-extrabold tracking-tight">Daily Mix {i + 1}</span>
                  <span className="absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full bg-accent text-on-accent opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    {loadingId === a.Id ? <Spinner className="size-4 border-on-accent/30 border-t-on-accent" /> : <Play className="size-4 translate-x-px fill-current" aria-hidden="true" />}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{a.Name} and more</p>
              </button>
            </RowItem>
          ))}
      {error && (
        <li role="alert" className="self-center px-4 text-sm text-danger">
          {error}
        </li>
      )}
    </MediaRow>
  );
}

/* ---------- most played ---------- */

function MostPlayed() {
  const tracks = useMostPlayedTracks(7);
  const title = tracks.data?.kind === "recent" ? "Recently added songs" : "Your most played";
  return (
    <section aria-label={title} className="px-4 sm:px-7">
      <h2 className="mb-3 font-display text-xl font-bold tracking-tight sm:text-[22px]">{title}</h2>
      {tracks.isPending && <TrackTableSkeleton rows={7} />}
      {tracks.isError && <ErrorState title="Couldn't load songs" className="py-6" action={<button type="button" className="text-accent" onClick={() => void tracks.refetch()}>Retry</button>} />}
      {tracks.data && tracks.data.tracks.length === 0 && <EmptyState title="No songs yet" className="py-6" />}
      {tracks.data && tracks.data.tracks.length > 0 && (
        <TrackTable tracks={tracks.data.tracks} source={{ label: title, href: "/music" }} showAlbum showPlays={tracks.data.kind === "played"} />
      )}
    </section>
  );
}

/* ---------- rows / grids ---------- */

function RecentAlbumsRow() {
  const albums = useRecentAlbums(20);
  if (albums.isError) return <ErrorState title="Couldn't load albums" className="py-6" />;
  if (albums.data?.length === 0) return null;
  return (
    <MediaRow title="Recently added albums">
      {albums.isPending
        ? Array.from({ length: 6 }, (_, i) => (
            <RowItem key={i}>
              <AlbumCardSkeleton />
            </RowItem>
          ))
        : albums.data.map((a) => (
            <RowItem key={a.Id}>
              <MusicAlbumCard item={a} subtitle={[a.AlbumArtist, a.ProductionYear].filter(Boolean).join(" · ")} />
            </RowItem>
          ))}
    </MediaRow>
  );
}

function TopArtistsRow() {
  const artists = useTopArtists(16);
  if (artists.isError) return <ErrorState title="Couldn't load artists" className="py-6" />;
  if (artists.data?.length === 0) return null;
  const played = artists.data?.some((a) => (a.UserData?.PlayCount ?? 0) > 0);
  return (
    <MediaRow title={played ? "Artists you play most" : "Artists in your library"}>
      {artists.isPending
        ? Array.from({ length: 6 }, (_, i) => (
            <RowItem key={i}>
              <ArtistCardSkeleton />
            </RowItem>
          ))
        : artists.data.map((a) => (
            <RowItem key={a.Id}>
              <MusicArtistCard item={a} />
            </RowItem>
          ))}
    </MediaRow>
  );
}

const gridCls = "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6 px-4 sm:px-7";

function AlbumGrid() {
  const [sort, setSort] = useState<AlbumSort>("added");
  const albums = useAlbumsSorted(sort);
  if (albums.isError) return <ErrorState title="Couldn't load albums" />;
  return (
    <>
    <div className="mb-4 flex justify-end px-4 sm:px-7">
      <SelectMenu value={sort} options={ALBUM_SORTS} onChange={setSort} label="Sort albums by" size="sm" />
    </div>
    <div className={gridCls}>
      {albums.isPending
        ? Array.from({ length: 12 }, (_, i) => <AlbumCardSkeleton key={i} />)
        : albums.data.map((a) => <MusicAlbumCard key={a.Id} item={a} className="w-full" subtitle={[a.AlbumArtist, a.ProductionYear].filter(Boolean).join(" · ")} />)}
    </div>
    </>
  );
}

function ArtistGrid() {
  const [sort, setSort] = useState<ArtistSort>("played");
  const artists = useArtistsSorted(sort);
  if (artists.isError) return <ErrorState title="Couldn't load artists" />;
  return (
    <>
      <div className="mb-4 flex justify-end px-4 sm:px-7">
        <SelectMenu value={sort} options={ARTIST_SORTS} onChange={setSort} label="Sort artists by" size="sm" />
      </div>
      <div className={gridCls}>
        {artists.isPending ? Array.from({ length: 12 }, (_, i) => <ArtistCardSkeleton key={i} />) : artists.data.map((a) => <MusicArtistCard key={a.Id} item={a} className="w-full" />)}
      </div>
    </>
  );
}

function PlaylistGrid() {
  const playlists = useMusicPlaylists();
  if (playlists.isError) return <ErrorState title="Couldn't load playlists" />;
  return (
    <div className={gridCls}>
      <Link href={`/music/playlist/${LIKED_ID}`} className="group block rounded-card outline-offset-4">
        <div className="flex aspect-square items-center justify-center rounded-card bg-linear-to-br from-accent to-accent/40 text-on-accent">
          <Heart className="size-12 fill-current" aria-hidden="true" />
        </div>
        <p className="mt-2 truncate text-sm font-medium">Liked Songs</p>
        <p className="truncate text-xs text-muted">Playlist</p>
      </Link>
      {playlists.isPending
        ? Array.from({ length: 6 }, (_, i) => <AlbumCardSkeleton key={i} />)
        : playlists.data.map((p) => <MusicAlbumCard key={p.Id} item={p} className="w-full" subtitle={`Playlist · ${p.ChildCount ?? 0} songs`} />)}
      {playlists.data?.length === 0 && <EmptyState title="No playlists yet" description="Create one with + in Your Library." className="col-span-full py-6" />}
    </div>
  );
}
