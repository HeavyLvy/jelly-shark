import { PosterCardSkeleton } from "@/components/media/cards";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { RAIL_HORIZONTAL_CLASS } from "./alpha-rail";
import { ListRowSkeleton } from "./library-items";

/** CSS twin of posterColumns() (lib/ui-config.ts) for the skeleton. */
export const GRID_COLS_CLASS = "poster-grid";
export const GRID_GAP_CLASS = "gap-x-4 gap-y-8 sm:gap-x-5";

export function LibraryGridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className={`grid ${GRID_COLS_CLASS} ${GRID_GAP_CLASS}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <PosterCardSkeleton key={i} fluid />
      ))}
    </div>
  );
}

export function LibraryListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Whole-page fallback (Suspense) matching the header, controls and grid. */
export function LibrarySkeleton() {
  return (
    <div className="px-4 pt-28 pb-24 sm:px-8 lg:px-11" aria-busy="true">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none font-extrabold tracking-display sm:text-6xl">Library</h1>
          <Skeleton className="mt-3 h-4 w-28" />
        </div>
        {/* Measured: compact control 314×46 on phones, large 386×54 from sm. */}
        <Skeleton className="h-11.5 w-78.5 max-w-full rounded-full sm:h-13.5 sm:w-96.5" />
      </div>
      <div className="mt-8 flex flex-col gap-3 border-b border-hairline pb-5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 gap-2 overflow-hidden py-1">
          {["w-14", "w-20", "w-16", "w-20", "w-24", "w-28"].map((w, i) => (
            <Skeleton key={i} className={`h-9 shrink-0 rounded-full ${w}`} />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-21.5" />
        </div>
      </div>
      {/* Horizontal A–Z strip (phones, tablets, short desktops). */}
      <Skeleton className={cn("mt-3 h-10 w-full rounded-full", RAIL_HORIZONTAL_CLASS)} />
      <div className="mt-6 lg:mt-8 lg:[@media(min-height:800px)]:pr-12">
        <LibraryGridSkeleton />
      </div>
    </div>
  );
}
