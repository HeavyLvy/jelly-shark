"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ListFilter } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { LIBRARY_FILTERS, type LibraryFilter } from "@/lib/queries/library";
import { useDismiss } from "./use-dismiss";

/** Mutually exclusive pairs (asking Jellyfin for both returns nothing). */
const EXCLUSIVE: Partial<Record<LibraryFilter, LibraryFilter>> = { watched: "unwatched", unwatched: "watched" };

/** Filter icon button with a count badge, opening a panel of toggles. */
export function FilterMenu({ value, onChange }: { value: LibraryFilter[]; onChange: (filters: LibraryFilter[]) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, buttonRef);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [open]);

  const toggle = (f: LibraryFilter) => {
    if (value.includes(f)) {
      onChange(value.filter((v) => v !== f));
    } else {
      const other = EXCLUSIVE[f];
      onChange([...value.filter((v) => v !== other), f]);
    }
  };

  const count = value.length;
  const label = count ? `Filters, ${count} active` : "Filters";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative inline-flex size-10 items-center justify-center rounded-card border transition",
          count ? "jelly-control border-accent text-accent" : "jelly-control text-text",
          open && "bg-overlay-strong",
        )}
      >
        <ListFilter className="size-4" aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent"
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-label="Filters"
          className="jelly-panel absolute right-0 z-30 mt-2 w-60 rounded-panel p-1.5"
          onKeyDown={(e) => {
            // Leaving the panel by Tab closes it, like a menu.
            if (e.key === "Tab") {
              const inputs = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("input, button") ?? []);
              const last = inputs[inputs.length - 1];
              const first = inputs[0];
              if ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first)) {
                setOpen(false);
              }
            }
          }}
        >
          <fieldset>
            <legend className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Show only</legend>
            {LIBRARY_FILTERS.map((f) => {
              const checked = value.includes(f.value);
              return (
                <label
                  key={f.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-card px-3 py-2 text-sm text-text-secondary transition hover:bg-overlay hover:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
                >
                  <span className={cn(checked && "font-semibold text-text")}>{f.label}</span>
                  <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(f.value)} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 items-center justify-center rounded-[5px] border transition",
                      checked ? "border-accent bg-accent text-on-accent" : "border-hairline-strong",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {count > 0 && (
            <div className="mt-1 border-t border-hairline px-1.5 pt-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-card px-1.5 py-2 text-left text-sm font-medium text-accent transition hover:bg-overlay"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
