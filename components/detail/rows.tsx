"use client";

import type { BaseItemDto, BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { UserRound } from "lucide-react";
import { PosterCard, PosterCardSkeleton } from "@/components/media/cards";
import { JfImage } from "@/components/media/jf-image";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { EmptyState } from "@/components/ui/states";
import type { ImageRef } from "@/lib/jellyfin/images";
import { useSimilar } from "@/lib/queries/items";
import { GUTTER, SectionError } from "./detail-hero";
import { POSTER_GRID_SIZES } from "@/lib/ui-config";

function personImage(p: BaseItemPerson): ImageRef | null {
  if (!p.Id || !p.PrimaryImageTag) return null;
  return {
    itemId: p.Id,
    type: "Primary",
    tag: p.PrimaryImageTag,
    blurhash: p.ImageBlurHashes?.Primary?.[p.PrimaryImageTag] ?? null,
  };
}

/** Circular headshots with name + role. Hidden when there's no cast. */
export function CastRow({ people }: { people: BaseItemPerson[] }) {
  const cast = people.filter((p) => p.Type === "Actor" || p.Type === "GuestStar").slice(0, 24);
  if (cast.length === 0) return null;
  return (
    <MediaRow title="Cast" gapClassName="gap-5">
      {cast.map((p, i) => (
        <RowItem key={`${p.Id ?? p.Name}-${i}`}>
          <div className="w-28 text-center">
            <div className="relative mx-auto size-24 overflow-hidden rounded-full bg-surface ring-1 ring-hairline">
              <JfImage
                image={personImage(p)}
                alt=""
                sizes="96px"
                className="absolute inset-0"
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center bg-surface-raised text-muted">
                    <UserRound className="size-9" aria-hidden="true" />
                  </div>
                }
              />
            </div>
            <p className="mt-2.5 line-clamp-2 text-sm leading-snug font-medium text-text">{p.Name}</p>
            {p.Role && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{p.Role}</p>}
          </div>
        </RowItem>
      ))}
    </MediaRow>
  );
}

/** "More Like This" poster row with skeleton, empty and error states. */
export function MoreLikeThis({ itemId }: { itemId: string }) {
  const similar = useSimilar(itemId, 16);
  if (similar.isError) {
    return (
      <section aria-labelledby="mlt-heading" className={GUTTER}>
        <h2 id="mlt-heading" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">More Like This</h2>
        <SectionError message="Couldn't load similar titles" onRetry={() => void similar.refetch()} />
      </section>
    );
  }
  if (similar.data && similar.data.length === 0) {
    return (
      <section aria-labelledby="mlt-heading" className={GUTTER}>
        <h2 id="mlt-heading" className="font-display text-xl font-bold tracking-tight sm:text-[22px]">More Like This</h2>
        <EmptyState as="h3" title="Nothing similar yet" description="Jellyfin couldn't find related titles in your library." className="py-10" />
      </section>
    );
  }
  return (
    <MediaRow title="More Like This">
      {similar.data
        ? similar.data.map((item) => (
            <RowItem key={item.Id}>
              <PosterCard item={item} />
            </RowItem>
          ))
        : Array.from({ length: 8 }, (_, i) => (
            <RowItem key={i}>
              <PosterCardSkeleton />
            </RowItem>
          ))}
    </MediaRow>
  );
}

/** Poster grid for a collection's children. */
export function CollectionGrid({
  items,
  isPending,
  isError,
  onRetry,
}: {
  items: BaseItemDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="collection-heading" className={GUTTER}>
      <h2 id="collection-heading" className="mb-4 font-display text-xl font-bold tracking-tight sm:text-[22px]">
        In this collection
        {items && items.length > 0 && <span className="ml-2 text-base font-medium text-muted">{items.length}</span>}
      </h2>
      {isError ? (
        <SectionError message="Couldn't load this collection" onRetry={onRetry} />
      ) : isPending ? (
        <div className="poster-grid gap-x-4 gap-y-6 sm:gap-x-5">
          {Array.from({ length: 6 }, (_, i) => (
            <PosterCardSkeleton key={i} fluid />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <EmptyState as="h3" title="This collection is empty" className="py-10" />
      ) : (
        <ul className="poster-grid gap-x-4 gap-y-6 sm:gap-x-5">
          {items.map((item) => (
            <li key={item.Id}>
              <PosterCard item={item} fluid sizes={POSTER_GRID_SIZES} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
