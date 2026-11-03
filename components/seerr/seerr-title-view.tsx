"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clapperboard, Clock, Download, Plus, Tv } from "lucide-react";
import { DetailSkeleton, GUTTER, HeroFrame } from "@/components/detail/detail-hero";
import { InfoPanel, type InfoRow } from "@/components/detail/info-panel";
import { HeroBackdropFrame, PlayButton } from "@/components/media/hero";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api-client";
import { formatRating } from "@/lib/format";
import { seerrImageSrc, useSeerrDetail, useSeerrRequest } from "@/lib/queries/seerr";
import { watchHref } from "@/lib/routes";
import { formatDay, formatMinutes, formatMoney, languageName, plural, yearsOf } from "@/lib/seerr/format";
import { isRequestable, type SeerrDetail, type SeerrMediaType, type SeerrRequestResult } from "@/lib/seerr/types";
import { SeasonPicker } from "./season-picker";
import { SeerrEpisodes } from "./seerr-episodes";
import { SeerrCastRow, SeerrRelatedRow } from "./seerr-rows";

/** /request/movie/<id> and /request/tv/<id>: a title that may not be in the library yet, laid out like one that is. */
export function SeerrTitleView({ type, id }: { type: SeerrMediaType; id: number }) {
  const detail = useSeerrDetail(type, id);
  if (detail.isError) return <TitleProblem error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) return <DetailSkeleton variant={type === "tv" ? "show" : "movie"} />;
  return (
    <div>
      <title>{`${detail.data.item.title} · Jelly Shark`}</title>
      <TitleDetail detail={detail.data} />
    </div>
  );
}

/** Whole-page problems: Seerr off, title unknown, or Seerr unreachable. */
export function TitleProblem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const back = (
    <Link href="/search" className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
      Back to Search
    </Link>
  );
  const status = error instanceof ApiError ? error.status : 0;
  const code = error instanceof ApiError ? error.code : "";
  return (
    <div className={`pt-36 pb-24 ${GUTTER}`}>
      {code === "not_configured" ? (
        <EmptyState as="h1" title="Requests aren't set up" description="An administrator can connect Seerr in Settings." action={back} />
      ) : status === 404 ? (
        <EmptyState as="h1" title="Seerr doesn't know this title" description="It may have been removed, or the link is wrong." action={back} />
      ) : status === 403 && code === "no_account" ? (
        <EmptyState as="h1" title="You don't have a Seerr account yet" description={error instanceof ApiError ? error.message : undefined} action={back} />
      ) : (
        <ErrorState
          as="h1"
          title="Couldn't load this title"
          description="Seerr didn't respond. Check your connection and try again."
          action={
            <button type="button" onClick={onRetry} className={buttonClasses({ variant: "secondary", className: "mt-2" })}>
              Try again
            </button>
          }
        />
      )}
    </div>
  );
}

/** The facts card: who made it, genres, where it came from, how it's doing. */
function infoRows(d: SeerrDetail): InfoRow[] {
  const isTv = d.item.mediaType === "tv";
  const rows: InfoRow[] = [];
  const row = (label: string, value: string | null | undefined) => value && rows.push({ label, value });
  row("Starring", d.cast.slice(0, 3).map((p) => p.name).join(", "));
  row("Created by", d.creators.slice(0, 2).join(", "));
  row("Directed by", d.directors.slice(0, 2).join(", "));
  if (!d.creators.length && !d.directors.length) row("Written by", d.writers.slice(0, 2).join(", "));
  row("Genres", d.genres.slice(0, 3).join(", "));
  row(isTv ? "Network" : "Studio", (isTv ? d.networks : d.studios).slice(0, 2).join(", "));
  row(isTv ? "First aired" : "Released", formatDay(d.date));
  row("Status", d.statusText);
  row("Next episode", d.nextEpisode ? `S${d.nextEpisode.season} E${d.nextEpisode.episode} · ${formatDay(d.nextEpisode.airDate)}` : null);
  row("Language", languageName(d.originalLanguage));
  const money = [formatMoney(d.budget) && `Budget ${formatMoney(d.budget)}`, formatMoney(d.revenue) && `Revenue ${formatMoney(d.revenue)}`].filter(Boolean).join(" · ");
  row("Box office", money);
  return rows;
}

function TitleDetail({ detail: d }: { detail: SeerrDetail }) {
  const { item } = d;
  const isTv = item.mediaType === "tv";
  const request = useSeerrRequest();
  const [picker, setPicker] = useState(false);
  const [sent, setSent] = useState<SeerrRequestResult["status"] | null>(null);
  const error = request.error instanceof ApiError ? request.error.message : request.isError ? "Couldn't send the request. Try again." : null;

  const inLibrary = !!d.jellyfinId && (item.status === "available" || item.status === "partial");
  const openSeasons = d.seasons.some((s) => isRequestable(s.status));
  const canRequest = isRequestable(item.status) && (!isTv || d.seasons.length === 0 || openSeasons);

  const send = (seasons?: number[]) =>
    request.mutate(isTv ? { mediaType: "tv", mediaId: item.id, seasons: seasons ?? [] } : { mediaType: "movie", mediaId: item.id }, {
      onSuccess: (r) => {
        setSent(r.status);
        setPicker(false);
      },
    });
  const onRequest = () => (isTv ? setPicker(true) : send());

  // What the main button does: play it, ask for it, or say where it stands.
  let primary;
  if (inLibrary && d.jellyfinId) {
    primary = isTv ? (
      <Link href={`/show/${d.jellyfinId}`} className={buttonClasses({ variant: "primary", size: "lg", shape: "card", className: "min-w-32 max-sm:w-full" })}>
        <Tv className="size-4" aria-hidden="true" />
        Go to show
      </Link>
    ) : (
      <PlayButton href={watchHref(d.jellyfinId)} label="Play" />
    );
  } else if (item.status === "available") {
    primary = (
      <Button size="lg" shape="card" disabled icon={<Check className="size-4" aria-hidden="true" />}>
        In your library
      </Button>
    );
  } else if (canRequest) {
    primary = (
      <Button size="lg" shape="card" disabled={request.isPending} onClick={onRequest} icon={<Plus className="size-4" aria-hidden="true" />} className="min-w-32">
        {request.isPending ? "Sending…" : "Request"}
      </Button>
    );
  } else {
    const waiting = item.status === "pending";
    primary = (
      <Button size="lg" shape="card" disabled icon={waiting ? <Clock className="size-4" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}>
        {waiting ? "Requested" : "Approved"}
      </Button>
    );
  }

  const trailerClass = buttonClasses({ variant: "secondary", size: "lg", shape: "card", className: "max-sm:size-12 max-sm:rounded-full max-sm:px-0" });
  const meta = isTv ? [d.numberOfSeasons ? plural(d.numberOfSeasons, "Season") : null, d.numberOfEpisodes ? plural(d.numberOfEpisodes, "Episode") : null] : [formatMinutes(d.runtime)];
  const rating = formatRating(d.rating);

  return (
    <div className="pb-20">
      <HeroFrame
        backdrop={
          <HeroBackdropFrame className="-z-10" overlay={<div className="absolute inset-0 bg-bg/55 md:hidden" />}>
            {d.backdropPath && (
              // eslint-disable-next-line @next/next/no-img-element -- a backdrop served by our own server
              <img src={seerrImageSrc(d.backdropPath, "w1280")} alt="" className="absolute inset-0 size-full object-cover object-[70%_20%]" />
            )}
          </HeroBackdropFrame>
        }
        hasBackdrop={!!d.backdropPath}
        back={{ href: "/search", label: "Search" }}
        historyBack
        title={
          <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-display text-balance sm:text-6xl lg:text-7xl lg:text-8xl xl:text-[7.25rem]">{item.title}</h1>
        }
        certification={d.certification}
        years={yearsOf(d)}
        meta={meta}
        rating={rating}
        tagline={d.tagline}
        overview={item.overview}
        primary={primary}
        secondary={
          <>
            {isTv && inLibrary && openSeasons && (
              <Button variant="secondary" size="lg" shape="card" disabled={request.isPending} onClick={() => setPicker(true)} icon={<Plus className="size-4" aria-hidden="true" />}>
                Request seasons
              </Button>
            )}
            {d.trailerUrl && (
              <a href={d.trailerUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch trailer (opens in a new tab)" className={trailerClass}>
                <Clapperboard className="size-4 max-sm:size-5" aria-hidden="true" />
                <span className="max-sm:sr-only">Trailer</span>
              </a>
            )}
            {sent && (
              <p role="status" className="basis-full text-sm text-text-secondary">
                Request sent. {sent === "pending" ? "It's waiting for an administrator to approve it." : "It was approved, and will show up in your library once it's added."}
              </p>
            )}
            {error && !picker && (
              <p role="alert" className="basis-full text-sm text-danger">
                {error}
              </p>
            )}
          </>
        }
        panel={<InfoPanel rows={infoRows(d)} />}
      />
      <div className={`mt-4 flex flex-col ${isTv ? "gap-14" : "gap-12"}`}>
        {isTv && <SeerrEpisodes detail={d} requesting={request.isPending} onRequestSeason={(n) => send([n])} />}
        <SeerrCastRow people={d.cast} />
        <SeerrRelatedRow type={item.mediaType} id={item.id} kind="recommendations" title="Recommended" />
        <SeerrRelatedRow type={item.mediaType} id={item.id} kind="similar" title="More Like This" />
      </div>
      {picker && <SeasonPicker title={item.title} seasons={d.seasons} busy={request.isPending} error={error} onSend={send} onClose={() => setPicker(false)} />}
    </div>
  );
}
