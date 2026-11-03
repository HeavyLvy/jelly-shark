"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { PosterCardSkeleton } from "@/components/media/cards";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { seerrHref, seerrImageSrc, useSeerrRelated } from "@/lib/queries/seerr";
import type { SeerrMediaType, SeerrPerson } from "@/lib/seerr/types";
import { SeerrPosterCard } from "./seerr-cards";

/** Circular headshots with name and role, each opening that person's page: the same look as a library title's Cast row. */
export function SeerrCastRow({ people }: { people: SeerrPerson[] }) {
  if (people.length === 0) return null;
  return (
    <MediaRow title="Cast" gapClassName="gap-5">
      {people.map((p) => (
        <RowItem key={p.id}>
          <Link href={seerrHref("person", p.id)} className="group block w-28 rounded-card text-center outline-offset-4">
            <div className="relative mx-auto size-24 overflow-hidden rounded-full bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
              {p.profilePath ? (
                // eslint-disable-next-line @next/next/no-img-element -- a headshot served by our own server
                <img src={seerrImageSrc(p.profilePath, "w185")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-raised text-muted">
                  <UserRound className="size-9" aria-hidden="true" />
                </div>
              )}
            </div>
            <p className="mt-2.5 line-clamp-2 text-sm leading-snug font-medium text-text group-hover:underline">{p.name}</p>
            {p.role && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{p.role}</p>}
          </Link>
        </RowItem>
      ))}
    </MediaRow>
  );
}

/**
 * "Recommended" / "More Like This": a poster row of other titles. Hidden when there are none or
 * Seerr can't say. "More Like This" leaves out what "Recommended" already shows.
 */
export function SeerrRelatedRow({ type, id, kind, title }: { type: SeerrMediaType; id: number; kind: "recommendations" | "similar"; title: string }) {
  const related = useSeerrRelated(type, id, kind);
  // The same query as the Recommended row, so this costs nothing extra.
  const recommended = useSeerrRelated(type, id, "recommendations");
  const shown = kind === "similar" ? related.data && recommended.data && related.data.filter((i) => !recommended.data.some((r) => r.id === i.id && r.mediaType === i.mediaType)) : related.data;
  if (related.isError || (shown && shown.length === 0)) return null;
  return (
    <MediaRow title={title}>
      {shown
        ? shown.map((item) => (
            <RowItem key={`${item.mediaType}-${item.id}`}>
              <SeerrPosterCard item={item} />
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
