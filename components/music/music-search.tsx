"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { AlbumCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { GenreTiles, RecentSearches, SongList, SongListSkeleton, TopResultCard, TopResultSkeleton } from "@/components/search/search-bits";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dotJoin } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useArtistAlbums, useArtistTopTracks } from "@/lib/queries/music";
import { fetchGenreTracks, pickTopResult, useMusicGenres, useSearchGroup } from "@/lib/queries/search";
import { usePlayer } from "@/lib/player/store";
import { ArtistCardSkeleton, MusicAlbumCard, MusicArtistCard } from "./music-cards";
import { TrackTable, TrackTableSkeleton } from "./track-table";
import { useScrolledPast } from "./use-scrolled-past";

type Filter = "all" | "songs" | "artists" | "albums" | "playlists";
const FILTERS: Filter[] = ["all", "songs", "artists", "albums", "playlists"];

/** Music search in the centre panel; the query comes from the top bar (?q=). */
export function MusicSearch() {
  const params = useSearchParams();
  // The top bar already waits for a typing pause before writing ?q=. Deferring
  // lets React render new results in the background, so typing never waits on it.
  const term = useDeferredValue((params.get("q") ?? "").trim());
  const [filter, setFilter] = useState<Filter>("all");
  const [sentinel, stuck] = useScrolledPast<HTMLDivElement>();

  return (
    <div className="relative pb-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] rounded-t-panel bg-linear-to-b from-accent/15 to-accent/0" />
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {term && (
        <div className={cn("sticky top-0 z-20 -mt-px px-5 py-3 sm:px-7", stuck ? "jelly rounded-t-panel border-x-0 border-t-0" : "border-b border-transparent")}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="h-8 px-4 text-xs capitalize">
                {f}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="relative">{term ? <Results term={term} filter={filter} /> : <Browse />}</div>
    </div>
  );
}

const PAD = "px-5 sm:px-7";

/** Concatenate result lists, dropping duplicates by Id. */
function mergeById(...lists: (BaseItemDto[] | undefined)[]): BaseItemDto[] {
  const seen = new Set<string>();
  const out: BaseItemDto[] = [];
  for (const list of lists) {
    for (const it of list ?? []) {
      if (!it.Id || seen.has(it.Id)) continue;
      seen.add(it.Id);
      out.push(it);
    }
  }
  return out;
}
const gridCls = "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6";

/** Genre tiles before "Show all" (sorted biggest first). */
const GENRES_SHOWN = 24;

function Browse() {
  const router = useRouter();
  const genres = useMusicGenres();
  const playItems = usePlayer((s) => s.playItems);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const all = genres.data ?? [];
  const shown = showAll ? all : all.slice(0, GENRES_SHOWN);

  const playGenre = async (g: BaseItemDto) => {
    if (!g.Id) return;
    setError(null);
    try {
      const tracks = await fetchGenreTracks(g);
      if (tracks.length === 0) setError(`No songs found for ${g.Name}.`);
      else playItems(tracks, 0, { label: `${g.Name} mix` });
    } catch {
      setError("Couldn't build that mix.");
    }
  };

  return (
    <div className={`space-y-10 pt-6 ${PAD}`}>
      <RecentSearches scope="music" onPick={(t) => router.replace(`/music/search?q=${encodeURIComponent(t)}`)} />
      <section aria-labelledby="music-browse" className="space-y-4">
        <div>
          <h1 id="music-browse" className="font-display text-2xl font-extrabold tracking-display sm:text-3xl">
            Browse all
          </h1>
          <p className="mt-1 text-sm text-muted">Pick a genre to start a mix.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {genres.isError ? (
          <ErrorState title="Couldn't load genres" />
        ) : (
          <>
            <GenreTiles genres={shown} loading={genres.isPending} onPick={(g) => void playGenre(g)} />
            {all.length > GENRES_SHOWN && (
              <div className="flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all ${all.length} genres`}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Results({ term, filter }: { term: string; filter: Filter }) {
  const all = filter === "all";
  const songs = useSearchGroup("songs", term, all ? 4 : 50, all || filter === "songs");
  const artists = useSearchGroup("artists", term, all ? 10 : 40, all || filter === "artists");
  const albums = useSearchGroup("albums", term, all ? 10 : 40, all || filter === "albums");
  const playlists = useSearchGroup("playlists", term, all ? 10 : 40, all || filter === "playlists");
  const source = { label: `Search: ${term}`, href: `/music/search?q=${encodeURIComponent(term)}` };

  // When the best match is an artist, fold in their popular songs and albums
  // (title search alone misses them — "bruno" doesn't match "Grenade").
  const top = pickTopResult(term, [artists.data, albums.data, songs.data, playlists.data]);
  const artistId = top?.Type === "MusicArtist" ? top.Id ?? "" : "";
  const artistSongs = useArtistTopTracks(artistId, all ? 4 : 30);
  const artistAlbums = useArtistAlbums(artistId);
  const songList = mergeById(songs.data, artistSongs.data);
  const albumList = mergeById(albums.data, artistAlbums.data);

  const enabled = all ? [songs, artists, albums, playlists] : [{ songs, artists, albums, playlists }[filter]];
  const loading = enabled.some((g) => g.isPending);
  if (enabled.every((g) => g.isError)) return <ErrorState title="Search failed" description="Couldn't reach the server. Try again." />;
  if (!loading && enabled.every((g) => (g.data?.length ?? 0) === 0) && songList.length + albumList.length === 0) {
    return <EmptyState title={`No results for “${term}”`} description="Check the spelling, or try a shorter or different term." />;
  }

  if (filter === "songs") {
    return <div className="px-3 sm:px-5">{songs.isPending ? <TrackTableSkeleton /> : <TrackTable tracks={songList} source={source} showAlbum />}</div>;
  }
  if (filter === "artists") {
    return (
      <div className={`${gridCls} ${PAD}`}>
        {artists.isPending ? Array.from({ length: 10 }, (_, i) => <ArtistCardSkeleton key={i} />) : artists.data?.map((a) => <MusicArtistCard key={a.Id} item={a} className="w-full" />)}
      </div>
    );
  }
  if (filter === "albums" || filter === "playlists") {
    const g = filter === "albums" ? albums : playlists;
    const list = filter === "albums" ? albumList : playlists.data ?? [];
    return (
      <div className={`${gridCls} ${PAD}`}>
        {g.isPending
          ? Array.from({ length: 10 }, (_, i) => <AlbumCardSkeleton key={i} />)
          : list.map((a) => (
              <MusicAlbumCard key={a.Id} item={a} className="w-full" subtitle={filter === "albums" ? dotJoin(a.AlbumArtist, a.ProductionYear) : `Playlist · ${a.ChildCount ?? 0} songs`} />
            ))}
      </div>
    );
  }

  return (
    <div className="space-y-10 pt-2">
      <div className={`grid grid-cols-[minmax(0,1fr)] gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] ${PAD}`}>
        <section aria-labelledby="music-top" className="space-y-3">
          <h2 id="music-top" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
            Top result
          </h2>
          {top ? <TopResultCard item={top} source={source} /> : loading ? <TopResultSkeleton /> : null}
        </section>
        {(songs.isPending || songList.length > 0) && (
          <section aria-labelledby="music-songs" className="space-y-3">
            <h2 id="music-songs" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
              Songs
            </h2>
            {songs.isPending ? <SongListSkeleton /> : <SongList songs={songList.slice(0, 4)} source={source} />}
          </section>
        )}
      </div>
      {(artists.isPending || (artists.data?.length ?? 0) > 0) && (
        <MediaRow title="Artists">
          {artists.isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <RowItem key={i}>
                  <ArtistCardSkeleton />
                </RowItem>
              ))
            : artists.data?.map((a) => (
                <RowItem key={a.Id}>
                  <MusicArtistCard item={a} />
                </RowItem>
              ))}
        </MediaRow>
      )}
      {(albums.isPending || albumList.length > 0) && (
        <MediaRow title="Albums">
          {albums.isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <RowItem key={i}>
                  <AlbumCardSkeleton />
                </RowItem>
              ))
            : albumList.map((a) => (
                <RowItem key={a.Id}>
                  <MusicAlbumCard item={a} subtitle={dotJoin(a.AlbumArtist, a.ProductionYear)} />
                </RowItem>
              ))}
        </MediaRow>
      )}
      {(playlists.data?.length ?? 0) > 0 && (
        <MediaRow title="Playlists">
          {playlists.data?.map((p) => (
            <RowItem key={p.Id}>
              <MusicAlbumCard item={p} subtitle={`Playlist · ${p.ChildCount ?? 0} songs`} />
            </RowItem>
          ))}
        </MediaRow>
      )}
    </div>
  );
}
