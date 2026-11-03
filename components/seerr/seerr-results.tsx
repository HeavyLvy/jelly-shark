"use client";

import { useState } from "react";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { ArtFallback } from "@/components/media/bits";
import { seerrPosterSrc } from "@/lib/queries/seerr";
import type { SeerrItem } from "@/lib/seerr/types";
import { RequestDialog } from "./request-dialog";
import { StatusBadge, statusLabel } from "./seerr-bits";

/** One title Seerr can request: a poster that opens the request dialog. */
function SeerrCard({ item, onOpen }: { item: SeerrItem; onOpen: () => void }) {
  const kind = item.mediaType === "movie" ? "Movie" : "TV show";
  const status = statusLabel(item.status);
  return (
    <button type="button" onClick={onOpen} aria-label={[`Request ${item.title}`, kind, item.year, status].filter(Boolean).join(", ")} className="group block w-poster shrink-0 rounded-card text-left outline-offset-4">
      <div className="relative aspect-[2/3] overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
        {item.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- a poster served by our own server
          <img src={seerrPosterSrc(item.posterPath)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <ArtFallback title={item.title} />
        )}
        <StatusBadge status={item.status} className="absolute top-2.5 left-2.5" />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-text">{item.title}</p>
      <p className="truncate text-xs text-muted">{[kind, item.year].filter(Boolean).join(" · ")}</p>
    </button>
  );
}

/** The "Not in your library" row on the search page: what Seerr can request for this search. */
export function SeerrRow({ items }: { items: SeerrItem[] }) {
  const [open, setOpen] = useState<SeerrItem | null>(null);
  if (items.length === 0) return null;
  return (
    <>
      <MediaRow title="Not in your library" subtitle="Ask for these through Seerr">
        {items.map((it) => (
          <RowItem key={`${it.mediaType}-${it.id}`}>
            <SeerrCard item={it} onOpen={() => setOpen(it)} />
          </RowItem>
        ))}
      </MediaRow>
      {open && <RequestDialog item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
