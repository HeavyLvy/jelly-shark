"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import type { BaseItemDtoQueryResult } from "@jellyfin/sdk/lib/generated-client/models";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/states";
import {
  LIBRARY_KINDS,
  kindInfo,
  libraryQueryString,
  parseLibraryState,
  useLibraryGenres,
  useLibraryItems,
  useLibraryTotal,
  type LibraryKind,
  type LibraryState,
  type LibraryView as ViewMode,
} from "@/lib/queries/library";
import { AlphaRail, RAIL_HORIZONTAL_CLASS, RAIL_VERTICAL_CLASS } from "./alpha-rail";
import { GenreChips } from "./genre-chips";
import { FilterMenu } from "./filter-menu";
import { LibraryResults, NoResults } from "./library-results";
import { SortMenu } from "./sort-menu";

function countLabel(n: number, singular: string, plural: string) {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

export function LibraryView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const state = useMemo(() => parseLibraryState(new URLSearchParams(searchParams.toString())), [searchParams]);
  const kind = kindInfo(state.kind);
  const resultsRef = useRef<HTMLDivElement>(null);

  /** Pushes a new URL state (Next syncs it into useSearchParams without a server round-trip). */
  const update = useCallback(
    (patch: Partial<LibraryState>) => {
      const next = { ...state, ...patch };
      window.history.pushState(null, "", `${pathname}${libraryQueryString(next)}`);
      // When the result set changes while scrolled deep, jump back to its top.
      if (!("view" in patch && Object.keys(patch).length === 1)) {
        const top = resultsRef.current ? resultsRef.current.getBoundingClientRect().top + window.scrollY - 128 : 0;
        if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
      }
    },
    [state, pathname],
  );

  const filtered = state.genre !== null || state.filters.length > 0 || state.letter !== null;
  const items = useLibraryItems(state);
  // Unfiltered, the first page's TotalRecordCount is the total; only count separately when narrowed.
  const total = useLibraryTotal(state.kind, filtered);
  const genres = useLibraryGenres(state.kind);

  // Keep the last settled results (same type) on screen, dimmed, while a new
  // genre/sort/filter/letter loads, instead of flashing back to the skeleton.
  const [settled, setSettled] = useState<{ kind: LibraryKind; data: InfiniteData<BaseItemDtoQueryResult> } | null>(null);
  if (items.data && settled?.data !== items.data) setSettled({ kind: state.kind, data: items.data });
  const stale = items.isPending && settled?.kind === state.kind ? settled.data : null;
  const shownData = items.data ?? stale;

  const allItems = useMemo(() => shownData?.pages.flatMap((p) => p.Items ?? []) ?? [], [shownData]);
  const matched = items.data?.pages[0]?.TotalRecordCount;
  const count = filtered
    ? { pending: total.isPending, error: total.isError, value: total.data }
    : { pending: items.isPending, error: items.isError, value: matched };
  const clearFilters = () => update({ genre: null, filters: [], letter: null });

  const tabHref = (k: LibraryKind) => `${pathname}${libraryQueryString({ ...state, kind: k, genre: null, letter: null })}`;

  const segments = LIBRARY_KINDS.map((k) => ({ value: k.value, label: k.label, href: tabHref(k.value) }));

  const genreNames = useMemo(() => {
    const names = (genres.data ?? []).map((g) => g.Name).filter((n): n is string => !!n);
    if (state.genre && !names.includes(state.genre)) names.unshift(state.genre);
    return names;
  }, [genres.data, state.genre]);

  return (
    <div className="px-4 pt-28 pb-24 sm:px-8 lg:px-11">
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none font-extrabold tracking-display sm:text-6xl">Library</h1>
          <div className="mt-3 min-h-5 text-sm text-text-secondary sm:text-base">
            {count.pending ? (
              <Skeleton className="h-4 w-28" />
            ) : count.error || count.value === undefined ? (
              <span className="text-muted">Couldn&apos;t count {kind.plural}</span>
            ) : (
              <p>
                {countLabel(count.value, kind.singular, kind.plural)}
                {filtered && matched !== undefined && <span className="text-muted"> · {matched.toLocaleString()} shown</span>}
              </p>
            )}
          </div>
        </div>
        {/* Compact on phones (fits 390px), large from sm up; only one is ever displayed. */}
        <div className="sm:hidden">
          <SegmentedControl aria-label="Library type" value={state.kind} segments={segments} />
        </div>
        <div className="hidden shrink-0 sm:block">
          <SegmentedControl aria-label="Library type" size="lg" value={state.kind} segments={segments} />
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex flex-col gap-3 border-b border-hairline pb-5 lg:flex-row lg:items-center lg:gap-4">
        <GenreChips
          genres={genreNames}
          value={state.genre}
          onChange={(genre) => update({ genre })}
          isPending={genres.isPending}
          isError={genres.isError}
          onRetry={() => void genres.refetch()}
        />
        <div className="flex shrink-0 items-center justify-end gap-2 self-end lg:self-auto">
          <SortMenu value={state.sort} onChange={(sort) => update({ sort })} />
          <FilterMenu value={state.filters} onChange={(filters) => update({ filters })} />
          <ViewToggle value={state.view} onChange={(view) => update({ view })} />
        </div>
      </div>

      <AlphaRail orientation="horizontal" value={state.letter} onChange={(letter) => update({ letter })} className={cn("mt-3", RAIL_HORIZONTAL_CLASS)} />

      <p className="sr-only" aria-live="polite">
        {items.isPending ? "" : matched !== undefined ? `${countLabel(matched, kind.singular, kind.plural)} shown` : ""}
      </p>

      {/* Results + A–Z rail */}
      <div ref={resultsRef} className="mt-6 flex gap-6 lg:mt-8">
        {/* Workaround: JfImage's own "relative" beats a passed "absolute" (no class merging), collapsing card art to 0px. */}
        <section
          aria-label={kind.label}
          aria-busy={stale ? true : undefined}
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-200",
            stale && "pointer-events-none opacity-60",
          )}
        >
          <LibraryResults
            view={state.view}
            items={allItems}
            isPending={items.isPending && !stale}
            isError={items.isError}
            onRetry={() => void items.refetch()}
            hasNextPage={items.hasNextPage}
            isFetchingNextPage={items.isFetchingNextPage}
            isFetchNextPageError={items.isFetchNextPageError}
            fetchNextPage={() => void items.fetchNextPage()}
            empty={<NoResults
                filtered={filtered}
                kindPlural={kind.plural}
                onClear={clearFilters}
                emptyHint={state.kind === "favorites" ? "Right-click a poster (long-press on a phone) or use the ♥ button, and your favourites collect here." : undefined}
              />}
          />
        </section>
        <AlphaRail
          orientation="vertical"
          value={state.letter}
          onChange={(letter) => update({ letter })}
          className={cn("sticky top-28 shrink-0 self-start", RAIL_VERTICAL_CLASS)}
        />
      </div>
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (view: ViewMode) => void }) {
  const btn = (active: boolean) =>
    cn(
      "inline-flex h-full w-10 items-center justify-center transition",
      active ? "bg-overlay-strong text-text" : "text-muted hover:bg-overlay hover:text-text",
    );
  return (
    <div role="group" aria-label="View" className="jelly-flat flex h-10 overflow-hidden rounded-card">
      <button type="button" aria-label="Grid view" aria-pressed={value === "grid"} onClick={() => onChange("grid")} className={btn(value === "grid")}>
        <LayoutGrid className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="List view"
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
        className={cn(btn(value === "list"), "border-l border-hairline")}
      >
        <List className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
