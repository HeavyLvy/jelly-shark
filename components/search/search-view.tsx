"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useRef, type FormEvent, type MouseEvent } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Search, X } from "lucide-react";
import { LandscapeCard, LandscapeCardSkeleton, PosterCard, PosterCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { MusicAlbumCard, MusicArtistCard } from "@/components/music/music-cards";
import { TrackTable } from "@/components/music/track-table";
import { Chip } from "@/components/ui/chip";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dotJoin } from "@/lib/format";
import { isTitleMatch, pickTopResult, useBrowseGenres, useSearchGroup } from "@/lib/queries/search";
import { useArtistAlbums, useArtistTopTracks } from "@/lib/queries/music";
import { addRecentSearch } from "@/lib/recent-searches";
import { useUrlSearchQuery } from "@/lib/use-url-search-query";
import { GenreTiles, RecentSearches, SongList, SongListSkeleton, TopResultCard, TopResultSkeleton } from "./search-bits";

type Filter = "all" | "movies" | "tv" | "music";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "tv", label: "TV Shows" },
  { value: "music", label: "Music" },
];

function parseFilter(v: string | null): Filter {
  return v === "movies" || v === "tv" || v === "music" ? v : "all";
}

/** Global search (mockup 05). */
export function SearchView() {
  const params = useSearchParams();
  // ?q= follows the input after a typing pause (shared with the Music search box);
  // results search what the URL holds, rendered in the background while typing.
  const { query: q, setQuery: setQ, flush, committed } = useUrlSearchQuery("/search");
  const term = useDeferredValue(committed.trim());
  // The filter lives in ?type= (shareable, survives reload, reset by the nav's Search link).
  const filter = parseFilter(params.get("type"));
  const setFilter = (next: Filter) => {
    const p = new URLSearchParams(window.location.search);
    if (next === "all") p.delete("type");
    else p.set("type", next);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addRecentSearch("all", q);
    flush();
    inputRef.current?.blur();
  };

  // Opening any result counts as a "real" search for the recents list.
  const onResultsClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) addRecentSearch("all", term);
  };

  return (
    <div className="pt-28 pb-16">
      <div className="mx-auto max-w-3xl px-4">
        <form role="search" onSubmit={submit} className="jelly-control flex h-16 items-center gap-4 rounded-full px-6 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-6 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="search-input" className="sr-only">
            Search movies, shows and music
          </label>
          <input
            ref={inputRef}
            id="search-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies, shows, music…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-lg text-text placeholder:text-muted focus:outline-none"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ("", { immediate: true });
                inputRef.current?.focus();
              }}
              className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </form>
        <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Search in">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-10" onClickCapture={onResultsClick}>
        {term ? <Results term={term} filter={filter} /> : <EmptySearch onPick={(t) => setQ(t, { immediate: true })} />}
      </div>
    </div>
  );
}

const PAD = "px-4 sm:px-8 lg:px-11";

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

function EmptySearch({ onPick }: { onPick: (term: string) => void }) {
  const genres = useBrowseGenres();
  return (
    <div className={`mx-auto max-w-[110rem] space-y-10 ${PAD}`}>
      <RecentSearches scope="all" onPick={onPick} />
      <section aria-labelledby="browse-all" className="space-y-4">
        <h2 id="browse-all" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
          Browse all
        </h2>
        {genres.isError ? (
          <ErrorState title="Couldn't load genres" />
        ) : (
          <GenreTiles genres={genres.data ?? []} loading={genres.isPending} hrefFor={(g) => `/library?type=movies&genre=${encodeURIComponent(g.Name ?? "")}`} />
        )}
      </section>
    </div>
  );
}

function Results({ term, filter }: { term: string; filter: Filter }) {
  const video = filter === "all" || filter === "movies" || filter === "tv";
  const music = filter === "all" || filter === "music";
  const big = filter !== "all";
  const movies = useSearchGroup("movies", term, big ? 60 : 16, filter === "all" || filter === "movies");
  const series = useSearchGroup("series", term, big ? 40 : 12, filter === "all" || filter === "tv");
  const episodes = useSearchGroup("episodes", term, big ? 40 : 12, filter === "all" || filter === "tv");
  const songs = useSearchGroup("songs", term, big ? 30 : 4, music);
  const artists = useSearchGroup("artists", term, big ? 20 : 8, music);
  const albums = useSearchGroup("albums", term, big ? 20 : 8, music);
  const playlists = useSearchGroup("playlists", term, 12, filter === "music");

  // Title search alone misses an artist's own songs/albums ("bruno" → Bruno Mars):
  // when the best match is an artist, fold in their popular songs and albums (like Spotify).
  const preTop =
    filter === "music"
      ? pickTopResult(term, [artists.data, albums.data, songs.data])
      : filter === "all"
        ? pickTopResult(term, [movies.data, series.data, artists.data, albums.data, songs.data, episodes.data])
        : null;
  const artistId = preTop?.Type === "MusicArtist" ? preTop.Id ?? "" : "";
  const artistSongs = useArtistTopTracks(artistId, big ? 20 : 4);
  const artistAlbums = useArtistAlbums(artistId);
  const songList = mergeById(songs.data, artistSongs.data);
  const albumList = mergeById(albums.data, artistAlbums.data);

  const enabledGroups =
    filter === "all" ? [movies, series, episodes, songs, artists, albums] : filter === "movies" ? [movies] : filter === "tv" ? [series, episodes] : [songs, artists, albums, playlists];
  const loading = enabledGroups.some((g) => g.isPending);
  const allEmpty = !loading && enabledGroups.every((g) => (g.data?.length ?? 0) === 0) && songList.length + albumList.length === 0;
  const allFailed = enabledGroups.length > 0 && enabledGroups.every((g) => g.isError);

  if (allFailed) return <ErrorState title="Search failed" description="Couldn't reach the server. Try again." className={PAD} />;
  if (allEmpty) return <EmptyState title={`No results for “${term}”`} description="Check the spelling, or try a shorter or different term." className={PAD} />;

  const top =
    filter === "music"
      ? pickTopResult(term, [artists.data, albums.data, songs.data, playlists.data])
      : filter === "movies"
        ? pickTopResult(term, [movies.data])
        : filter === "tv"
          ? pickTopResult(term, [series.data, episodes.data])
          : pickTopResult(term, [movies.data, series.data, artists.data, albums.data, songs.data, episodes.data]);

  const source = { label: `Search: ${term}`, href: `/search?q=${encodeURIComponent(term)}` };
  const movieSub = (m: BaseItemDto) => dotJoin(m.ProductionYear, isTitleMatch(m, term) ? "Title match" : "Other match");
  const showSongsBeside = (filter === "all" || filter === "music") && (songs.isPending || songList.length > 0);

  return (
    <div className="space-y-10">
      {/* Top result + Songs */}
      {filter !== "movies" && filter !== "tv" && (
        <div className={`mx-auto grid max-w-[110rem] grid-cols-[minmax(0,1fr)] gap-8 ${showSongsBeside ? "xl:grid-cols-2" : ""} ${PAD}`}>
          <section aria-labelledby="top-result" className="space-y-3">
            <h2 id="top-result" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
              Top result
            </h2>
            {top ? <TopResultCard item={top} source={source} /> : loading ? <TopResultSkeleton /> : null}
          </section>
          {showSongsBeside && (
            <section aria-labelledby="songs" className="space-y-3">
              <h2 id="songs" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
                Songs
              </h2>
              {songs.isPending ? <SongListSkeleton /> : filter === "music" ? <TrackTable tracks={songList} source={source} showAlbum /> : <SongList songs={songList.slice(0, 4)} source={source} />}
            </section>
          )}
        </div>
      )}

      {/* Movies */}
      {video && filter !== "tv" && (movies.isPending || (movies.data?.length ?? 0) > 0) && (
        filter === "movies" ? (
          <section aria-labelledby="movies-grid" className={`mx-auto max-w-[110rem] space-y-4 ${PAD}`}>
            <h2 id="movies-grid" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">
              Movies
            </h2>
            <div className="poster-grid gap-x-4 gap-y-6 sm:gap-x-5">
              {movies.isPending ? Array.from({ length: 12 }, (_, i) => <PosterCardSkeleton key={i} fluid />) : movies.data?.map((m) => <PosterCard key={m.Id} item={m} fluid subtitle={movieSub(m)} />)}
            </div>
          </section>
        ) : (
          <MediaRow title="Movies" subtitle="Matches in titles">
            {movies.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <RowItem key={i}>
                    <PosterCardSkeleton />
                  </RowItem>
                ))
              : movies.data?.map((m) => (
                  <RowItem key={m.Id}>
                    <PosterCard item={m} subtitle={movieSub(m)} />
                  </RowItem>
                ))}
          </MediaRow>
        )
      )}

      {/* TV shows & episodes */}
      {video && filter !== "movies" && (series.isPending || episodes.isPending || (series.data?.length ?? 0) + (episodes.data?.length ?? 0) > 0) && (
        <MediaRow title="TV Shows & Episodes">
          {series.isPending || episodes.isPending
            ? Array.from({ length: 4 }, (_, i) => (
                <RowItem key={i}>
                  <LandscapeCardSkeleton />
                </RowItem>
              ))
            : [...(series.data ?? []), ...(episodes.data ?? [])].map((it) => (
                <RowItem key={it.Id}>
                  <LandscapeCard item={it} />
                </RowItem>
              ))}
        </MediaRow>
      )}

      {/* Artists & albums */}
      {music && (artists.isPending || albums.isPending || (artists.data?.length ?? 0) + albumList.length > 0) && (
        <MediaRow title="Artists & Albums">
          {artists.isPending || albums.isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <RowItem key={i}>
                  <PosterCardSkeleton />
                </RowItem>
              ))
            : [
                ...(artists.data ?? []).map((a) => (
                  <RowItem key={`ar-${a.Id}`}>
                    <MusicArtistCard item={a} />
                  </RowItem>
                )),
                ...albumList.map((a) => (
                  <RowItem key={`al-${a.Id}`}>
                    <MusicAlbumCard item={a} subtitle={dotJoin("Album", a.AlbumArtist)} />
                  </RowItem>
                )),
              ]}
        </MediaRow>
      )}

      {/* Playlists (Music filter) */}
      {filter === "music" && (playlists.data?.length ?? 0) > 0 && (
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
