"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { PosterCardSkeleton } from "@/components/media/cards";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/states";
import type { LibraryView } from "@/lib/queries/library";
import { useNow } from "@/lib/use-now";
import { LibraryGridCard, LibraryListRow, ListHeader, ListRowSkeleton } from "./library-items";
import { GRID_GAP_CLASS, LibraryGridSkeleton, LibraryListSkeleton } from "./library-skeleton";
import { posterColumns } from "@/lib/ui-config";

const COL_GAP = { sm: 16, lg: 20 };
const ROW_GAP = 32;
/** Title + subline under a poster (mt-2 + 20px + 16px). */
const CARD_TEXT_HEIGHT = 44;
const LIST_ROW_HEIGHT = 81;

interface LibraryResultsProps {
  view: LibraryView;
  items: BaseItemDto[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  /** Rendered when there are no results. */
  empty: ReactNode;
}

export function LibraryResults(props: LibraryResultsProps) {
  const { view, items, isPending, isError, onRetry } = props;

  if (isPending) return view === "grid" ? <LibraryGridSkeleton /> : <LibraryListSkeleton />;
  if (isError && items.length === 0) {
    return (
      <ErrorState
        title="Couldn't load your library"
        description="The Jellyfin server didn't respond. Check your connection and try again."
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  if (items.length === 0) return <>{props.empty}</>;
  return <VirtualResults {...props} />;
}

function VirtualResults({ view, items, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage }: LibraryResultsProps) {
  const now = useNow();
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Track the grid width (columns) and its document offset (window virtualizer).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const isGrid = view === "grid";
  const colGap = width >= 640 ? COL_GAP.lg : COL_GAP.sm;
  // Posters stay ≈ NEXT_PUBLIC_POSTER_WIDTH on any monitor; wider screens get more columns.
  const cols = isGrid ? posterColumns(width || 1200, colGap) : 1;

  const rows = useMemo(() => {
    const out: BaseItemDto[][] = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [items, cols]);

  const loaderRow = hasNextPage || isFetchNextPageError;
  const count = rows.length + (loaderRow ? 1 : 0);
  const colWidth = width ? (width - colGap * (cols - 1)) / cols : 180;
  const estimate = isGrid ? colWidth * 1.5 + CARD_TEXT_HEIGHT + ROW_GAP : LIST_ROW_HEIGHT;

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize: () => estimate,
    overscan: isGrid ? 2 : 8,
    scrollMargin,
    // The default flushSync renders synchronously inside every scroll event,
    // which made scrolling the grid janky; let React batch instead.
    useFlushSync: false,
  });

  // Column count / view changes alter every row height.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, cols, view, estimate]);

  const virtualRows = virtualizer.getVirtualItems();
  const lastIndex = virtualRows.length ? virtualRows[virtualRows.length - 1].index : -1;

  // Load the next page as the viewport nears the end of what's loaded.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    if (lastIndex >= rows.length - (isGrid ? 3 : 15)) fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, isGrid]);

  return (
    <div>
      {!isGrid && <ListHeader />}
      <div ref={listRef} role="list" aria-label="Library items" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          return (
            <div
              key={vr.key}
              role="none"
              data-index={vr.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${vr.start - virtualizer.options.scrollMargin}px)` }}
            >
              {row ? (
                isGrid ? (
                  <GridRow row={row} cols={cols} now={now} preload={vr.index === 0} />
                ) : (
                  <ListRow item={row[0]} now={now} />
                )
              ) : (
                <LoaderRow
                  isGrid={isGrid}
                  cols={cols}
                  failed={isFetchNextPageError}
                  loading={isFetchingNextPage}
                  onRetry={fetchNextPage}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Memoized so the virtualizer's per-scroll re-render only touches rows whose items changed. */
const GridRow = memo(function GridRow({ row, cols, now, preload }: { row: BaseItemDto[]; cols: number; now: Date | null; preload: boolean }) {
  return (
    <div role="none" className={`grid ${GRID_GAP_CLASS}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, paddingBottom: ROW_GAP }}>
      {row.map((item) => (
        <div role="listitem" key={item.Id}>
          <LibraryGridCard item={item} now={now} preload={preload} />
        </div>
      ))}
    </div>
  );
});

const ListRow = memo(function ListRow({ item, now }: { item: BaseItemDto; now: Date | null }) {
  return (
    <div role="listitem" className="border-b border-hairline py-1">
      <LibraryListRow item={item} now={now} />
    </div>
  );
});

function LoaderRow({ isGrid, cols, failed, loading, onRetry }: { isGrid: boolean; cols: number; failed: boolean; loading: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-text-secondary">Couldn&apos;t load more titles.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div role="none" className="relative">
      {isGrid ? (
        <div className={`grid ${GRID_GAP_CLASS}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, paddingBottom: ROW_GAP }}>
          {Array.from({ length: cols }, (_, i) => (
            <PosterCardSkeleton key={i} fluid />
          ))}
        </div>
      ) : (
        <ListRowSkeleton />
      )}
      {loading && <Spinner label="Loading more titles" className="sr-only" />}
    </div>
  );
}

export function NoResults({ filtered, kindPlural, onClear }: { filtered: boolean; kindPlural: string; onClear: () => void }) {
  return filtered ? (
    <EmptyState
      title={`No ${kindPlural} match`}
      description="Try a different genre or letter, or clear your filters."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState title={`No ${kindPlural} yet`} description={`When ${kindPlural} are added to your Jellyfin server, they'll show up here.`} />
  );
}
