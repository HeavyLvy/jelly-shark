"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { isRequestable, type SeerrSeason } from "@/lib/seerr/types";
import { statusLabel } from "./seerr-bits";

/**
 * Choose which seasons of a show to request. Seasons already requested or in
 * the library are listed but can't be picked. It only asks; the page it opens
 * from sends the request and decides what happens next.
 */
export function SeasonPicker({
  title,
  seasons,
  busy,
  error,
  onSend,
  onClose,
}: {
  title: string;
  seasons: SeerrSeason[];
  busy: boolean;
  error: string | null;
  onSend: (seasons: number[]) => void;
  onClose: () => void;
}) {
  const open = seasons.filter((s) => isRequestable(s.status));
  const [picked, setPicked] = useState<number[]>(open.length === 1 ? [open[0].number] : []);
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

  useEffect(() => {
    primary.current?.focus();
  }, []);

  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const label = picked.length === 1 ? "Request 1 season" : picked.length > 1 ? `Request ${picked.length} seasons` : "Request";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="jelly-panel flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-panel sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="season-picker-title" className="font-display text-xl leading-tight font-bold">
              Request seasons
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted">{title}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <fieldset className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-text">
            <span>Seasons</span>
            {open.length > 1 && (
              <button type="button" onClick={() => setPicked(picked.length === open.length ? [] : open.map((s) => s.number))} className="text-sm font-semibold text-accent hover:underline">
                {picked.length === open.length ? "Clear" : "Select all"}
              </button>
            )}
          </legend>
          {seasons.length === 0 ? (
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

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button ref={primary} disabled={picked.length === 0 || busy} onClick={() => onSend(picked)}>
            {busy ? "Sending…" : label}
          </Button>
        </div>
      </div>
    </div>
  );
}
