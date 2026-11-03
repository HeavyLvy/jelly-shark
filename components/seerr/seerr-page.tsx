"use client";

import { useParams } from "next/navigation";
import { GUTTER } from "@/components/detail/detail-hero";
import { EmptyState } from "@/components/ui/states";
import { SeerrPersonView } from "./seerr-person-view";
import { SeerrTitleView } from "./seerr-title-view";

/** Picks the page for /request/<movie|tv|person>/<id>. */
export function SeerrPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const n = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  if (n <= 0 || (type !== "movie" && type !== "tv" && type !== "person")) {
    return (
      <div className={`pt-36 pb-24 ${GUTTER}`}>
        <EmptyState as="h1" title="Nothing here" description="That link doesn't point to a movie, show or person." />
      </div>
    );
  }
  return type === "person" ? <SeerrPersonView key={n} id={n} /> : <SeerrTitleView key={`${type}-${n}`} type={type} id={n} />;
}
