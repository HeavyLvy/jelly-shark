"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/states";
import { ApiError, apiFetch } from "@/lib/api-client";
import { seerrKeys, seerrPosterSrc, useSeerrDetail } from "@/lib/queries/seerr";
import { isRequestable, type SeerrItem, type SeerrRequestBody, type SeerrRequestResult } from "@/lib/seerr/types";
import { StatusBadge, statusLabel } from "./seerr-bits";

/**
 * Ask for a movie, or for chosen seasons of a show, through Seerr. Seasons
 * that are already requested or available are shown but can't be picked.
 */
export function RequestDialog({ item, onClose }: { item: SeerrItem; onClose: () => void }) {
  const qc = useQueryClient();
  const isTv = item.mediaType === "tv";
  const detail = useSeerrDetail(item.mediaType, item.id, true);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SeerrRequestResult["status"] | null>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prevFocus?.focus?.();
    };
  }, [onClose]);

  const current = detail.data?.item ?? item;
  const seasons = detail.data?.seasons ?? [];
  const open = seasons.filter((s) => isRequestable(s.status));
  const canRequest = isTv ? picked.length > 0 : isRequestable(current.status);

  useEffect(() => {
    if (!detail.isPending) primary.current?.focus();
  }, [detail.isPending]);

  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  const send = async () => {
    if (busy || !canRequest) return;
    setBusy(true);
    setError(null);
    const body: SeerrRequestBody = isTv ? { mediaType: "tv", mediaId: item.id, seasons: picked } : { mediaType: "movie", mediaId: item.id };
    try {
      const res = await apiFetch<SeerrRequestResult>("/api/seerr/request", { method: "POST", json: body });
      setDone(res.status);
      void qc.invalidateQueries({ queryKey: seerrKeys.all });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const label = isTv ? (picked.length === 1 ? "Request 1 season" : `Request ${picked.length || ""} seasons`.replace("  ", " ")) : "Request";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="request-title" onClick={(e) => e.stopPropagation()} className="jelly-panel flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-panel sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-card bg-surface ring-1 ring-hairline sm:w-24">
            {item.posterPath && (
              // eslint-disable-next-line @next/next/no-img-element -- a poster served by our own server
              <img src={seerrPosterSrc(item.posterPath)} alt="" className="absolute inset-0 size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="request-title" className="font-display text-xl leading-tight font-bold">
              {item.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{[isTv ? "TV show" : "Movie", item.year].filter(Boolean).join(" · ")}</p>
            <StatusBadge status={current.status} className="mt-2" />
            {item.overview && <p className="mt-2 line-clamp-4 text-sm text-text-secondary">{item.overview}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent">
              <Check className="size-7" strokeWidth={3} aria-hidden="true" />
            </span>
            <p role="status" className="mt-4 font-semibold text-text">
              Request sent
            </p>
            <p className="mt-1 text-sm text-text-secondary">{done === "pending" ? "It's waiting for an administrator to approve it." : "It was approved. It will show up in your library once it's added."}</p>
            <Button className="mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            {isTv && (
              <fieldset className="mt-5 min-h-0 flex-1 overflow-y-auto">
                <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-text">
                  <span>Seasons</span>
                  {open.length > 1 && (
                    <button type="button" onClick={() => setPicked(picked.length === open.length ? [] : open.map((s) => s.number))} className="text-sm font-semibold text-accent hover:underline">
                      {picked.length === open.length ? "Clear" : "Select all"}
                    </button>
                  )}
                </legend>
                {detail.isPending ? (
                  <Spinner label="Loading seasons" className="mx-auto my-4" />
                ) : detail.isError ? (
                  <p role="alert" className="text-sm text-danger">
                    Couldn&apos;t load the seasons. Close this and try again.
                  </p>
                ) : seasons.length === 0 ? (
                  <p className="text-sm text-muted">Seerr has no seasons listed for this show.</p>
                ) : (
                  <ul className="space-y-1">
                    {seasons.map((s) => {
                      const can = isRequestable(s.status);
                      const id = `season-${s.number}`;
                      return (
                        <li key={s.number}>
                          <label htmlFor={id} className={cn("flex min-h-11 items-center gap-3 rounded-card px-3 py-2", can ? "cursor-pointer hover:bg-overlay" : "opacity-60")}>
                            <input id={id} type="checkbox" checked={picked.includes(s.number)} disabled={!can || busy} onChange={() => toggle(s.number)} className="size-4 accent-[var(--color-accent)]" />
                            <span className="min-w-0 flex-1 truncate text-sm text-text">{s.name}</span>
                            <span className="text-xs text-muted">{statusLabel(s.status) ?? (s.episodeCount ? `${s.episodeCount} episodes` : "")}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            )}
            {!isTv && !isRequestable(current.status) && !detail.isPending && <p className="mt-5 text-sm text-text-secondary">{statusLabel(current.status)}: there is nothing more to request.</p>}
            {error && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button ref={primary} disabled={!canRequest || busy || detail.isPending} onClick={() => void send()}>
                {busy ? "Sending…" : label}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
