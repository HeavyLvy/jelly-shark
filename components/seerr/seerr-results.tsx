"use client";

import { MediaRow, RowItem } from "@/components/media/media-row";
import type { SeerrItem } from "@/lib/seerr/types";
import { SeerrPosterCard } from "./seerr-cards";

/** The "Not in your library" row on the search page: what Seerr can request for this search. Each title opens its own page. */
export function SeerrRow({ items }: { items: SeerrItem[] }) {
  if (items.length === 0) return null;
  return (
    <MediaRow title="Not in your library" subtitle="Ask for these through Seerr">
      {items.map((it) => (
        <RowItem key={`${it.mediaType}-${it.id}`}>
          <SeerrPosterCard item={it} />
        </RowItem>
      ))}
    </MediaRow>
  );
}
