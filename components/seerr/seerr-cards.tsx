"use client";

import Link from "next/link";
import { ArtFallback } from "@/components/media/bits";
import { cn } from "@/components/ui/cn";
import { seerrHref, seerrImageSrc } from "@/lib/queries/seerr";
import type { SeerrItem } from "@/lib/seerr/types";
import { StatusBadge, statusLabel } from "./seerr-bits";

/**
 * A title that isn't (necessarily) in the library, laid out like a library
 * poster card. It opens the title's own page, where it can be requested.
 */
export function SeerrPosterCard({ item, fluid, subtitle }: { item: SeerrItem; fluid?: boolean; subtitle?: string }) {
  const kind = item.mediaType === "movie" ? "Movie" : "TV show";
  const status = statusLabel(item.status);
  return (
    <Link
      href={seerrHref(item.mediaType, item.id)}
      aria-label={[item.title, kind, item.year, status].filter(Boolean).join(", ")}
      className={cn("group block shrink-0 rounded-card outline-offset-4", fluid ? "w-full" : "w-poster")}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
        {item.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- a poster served by our own server
          <img src={seerrImageSrc(item.posterPath)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <ArtFallback title={item.title} />
        )}
        <StatusBadge status={item.status} className="absolute top-2.5 left-2.5" />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-text">{item.title}</p>
      <p className="truncate text-xs text-muted">{subtitle ?? [kind, item.year].filter(Boolean).join(" · ")}</p>
    </Link>
  );
}
