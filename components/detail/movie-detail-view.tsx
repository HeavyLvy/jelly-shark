"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Check } from "lucide-react";
import { AddToListButton, FavoriteButton, PlayButton } from "@/components/media/hero";
import { IconButton } from "@/components/ui/button";
import { formatEndsAt, formatRuntime, formatTimeLeft, playedPercent, remainingTicks } from "@/lib/format";
import { useCollectionItems, isNotFoundError } from "@/lib/queries/detail";
import { useItem, useTogglePlayed } from "@/lib/queries/items";
import { detailHref, watchHref } from "@/lib/routes";
import { pickImage } from "@/lib/jellyfin/images";
import { useNow } from "@/lib/use-now";
import { DetailError, DetailHero, DetailNotFound, DetailSkeleton } from "./detail-hero";
import { InfoPanel, peopleRows, streamRows, streamsOf } from "./info-panel";
import { CastRow, CollectionGrid, MoreLikeThis } from "./rows";
import { ExtrasRow, MediaInfo, TrailerButton } from "./extras";

/** Item types that have their own detail route; /item/<id> forwards to it. */
function forwardHref(item: BaseItemDto): string | null {
  if (item.Type === "Series" || item.Type === "Season") return detailHref(item);
  if (item.Type === "Episode" && item.SeriesId) return detailHref(item);
  if (item.Type === "MusicAlbum" || item.Type === "MusicArtist" || item.Type === "Playlist") return detailHref(item);
  return null;
}

/** /item/[id] — movies (and other single videos) and collections. */
export function MovieDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useItem(id);
  const item = query.data;
  const forward = item ? forwardHref(item) : null;

  useEffect(() => {
    if (forward) router.replace(forward);
  }, [forward, router]);

  if (query.isError) {
    return isNotFoundError(query.error) ? <DetailNotFound /> : <DetailError onRetry={() => void query.refetch()} />;
  }
  if (!item || forward) return <DetailSkeleton variant="movie" />;

  return (
    <div>
      <title>{`${item.Name ?? "Title"} · Jelly Shark`}</title>
      {item.Type === "BoxSet" ? <CollectionDetail item={item} /> : <MovieDetail item={item} />}
    </div>
  );
}

function MovieDetail({ item }: { item: BaseItemDto }) {
  const now = useNow();
  const id = item.Id ?? "";
  const runtime = formatRuntime(item.RunTimeTicks);
  const endsAt = now ? formatEndsAt(remainingTicks(item), now) : null;
  const inProgress = playedPercent(item) !== null;
  const left = formatTimeLeft(item);
  const rows = [...peopleRows(item), ...streamRows(streamsOf(item))];

  return (
    <div className="pb-20">
      <DetailHero
        item={item}
        meta={[runtime, { node: endsAt, hideOnPhone: true }]}
        primary={<PlayButton href={watchHref(id)} label={inProgress ? (left ? `Resume · ${left}` : "Resume") : "Play"} />}
        secondary={
          <>
            <TrailerButton item={item} />
            <WatchedToggle item={item} />
            <AddToListButton item={item} />
            <FavoriteButton item={item} />
          </>
        }
        panel={<InfoPanel rows={rows} />}
      />
      <div className="mt-6 flex flex-col gap-12">
        <ExtrasRow item={item} />
        <CastRow people={item.People ?? []} />
        <MoreLikeThis itemId={id} />
        <MediaInfo item={item} className="mx-4 sm:mx-8 lg:mx-11" />
      </div>
    </div>
  );
}

function WatchedToggle({ item }: { item: BaseItemDto }) {
  const toggle = useTogglePlayed();
  const played = !!item.UserData?.Played;
  return (
    <IconButton
      size="lg"
      aria-label={played ? `Mark ${item.Name} as unwatched` : `Mark ${item.Name} as watched`}
      aria-pressed={played}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ item, played: !played })}
      // Variant utilities are emitted after base ones, so these beat the outline colours.
      className="aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent aria-pressed:hover:bg-accent"
    >
      <Check className="size-5" strokeWidth={played ? 3 : 2} aria-hidden="true" />
    </IconButton>
  );
}

function CollectionDetail({ item }: { item: BaseItemDto }) {
  const id = item.Id ?? "";
  const children = useCollectionItems(id);
  const count = children.data?.length ?? item.ChildCount ?? null;
  const first = children.data?.find((c) => c.Type === "Movie" || c.Type === "Episode" || c.Type === "Video");
  const genres = Array.from(new Set((children.data ?? []).flatMap((c) => c.Genres ?? []))).slice(0, 3);
  const rows = peopleRows(item);
  if (genres.length && !rows.some((r) => r.label === "Genres")) rows.push({ label: "Genres", value: genres.join(", ") });
  // A collection rarely has its own backdrop; borrow the first child's.
  const backdropItem = pickImage(item, "backdrop") ? undefined : children.data?.find((c) => pickImage(c, "backdrop"));

  return (
    <div className="pb-20">
      <DetailHero
        item={item}
        backdropItem={backdropItem}
        meta={[count ? `${count} ${count === 1 ? "Title" : "Titles"}` : null]}
        primary={first?.Id ? <PlayButton href={watchHref(first.Id)} label="Play" /> : null}
        secondary={
          <>
            <AddToListButton item={item} />
            <FavoriteButton item={item} />
          </>
        }
        panel={<InfoPanel rows={rows} pendingRows={children.isPending ? 2 : 0} />}
      />
      <div className="mt-6 flex flex-col gap-12">
        <CollectionGrid
          items={children.data}
          isPending={children.isPending}
          isError={children.isError}
          onRetry={() => void children.refetch()}
        />
        <MoreLikeThis itemId={id} />
      </div>
    </div>
  );
}
