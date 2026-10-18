"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { GripVertical, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatRuntime } from "@/lib/format";
import { usePlayer, type QueueItem } from "@/lib/player/store";
import { useDragReorder, type DragState } from "@/lib/use-drag-reorder";
import { TrackArt } from "./track-bits";

function Row({
  item,
  index,
  isCurrent,
  total,
  drag,
  onGrab,
  rowStyle,
}: {
  item: QueueItem;
  index: number;
  isCurrent: boolean;
  total: number;
  drag: DragState | null;
  onGrab: (e: PointerEvent<HTMLElement>, index: number) => void;
  rowStyle: (index: number) => CSSProperties | undefined;
}) {
  const { jumpTo, removeAt, move } = usePlayer.getState();
  const dragging = drag?.from === index;
  return (
    <li
      data-reorder-index={index}
      style={rowStyle(index)}
      className={cn(
        "group relative flex items-center gap-2 rounded-card py-1.5 pr-1 pl-1",
        dragging ? "z-10 bg-surface-raised shadow-xl shadow-black/40" : "transition-[transform,background-color] duration-150",
        !dragging && (isCurrent ? "bg-overlay-strong" : "hover:bg-overlay"),
      )}
    >
      <button type="button" onClick={() => jumpTo(index)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-current={isCurrent ? "true" : undefined}>
        <TrackArt item={item} size={40} className="size-10" />
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-medium", isCurrent ? "text-accent" : "text-text")}>{item.Name}</span>
          <span className="block truncate text-xs text-muted">{item.Artists?.join(", ") || item.AlbumArtist}</span>
        </span>
      </button>
      <span className="hidden text-xs text-muted tabular-nums sm:inline">{formatRuntime(item.RunTimeTicks)}</span>
      <button
        type="button"
        aria-label={`Remove ${item.Name} from queue`}
        onClick={() => removeAt(index)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-danger sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {/* Drag handle (touch + mouse). Keyboard: ↑/↓ move the song. touch-none so dragging doesn't scroll. */}
      <button
        type="button"
        aria-label={`Reorder ${item.Name} (drag, or use the arrow keys)`}
        onPointerDown={(e) => onGrab(e, index)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && index > 0) {
            e.preventDefault();
            move(index, index - 1);
          } else if (e.key === "ArrowDown" && index < total - 1) {
            e.preventDefault();
            move(index, index + 1);
          }
        }}
        className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted hover:text-text active:cursor-grabbing"
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Slide-over queue (jelly panel): now playing, up next, reorder, remove, clear. */
export function QueuePanel() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const { setPanel, clearQueue } = usePlayer.getState();
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { drag, onGrab, rowStyle } = useDragReorder(scrollerRef, (from, to) => usePlayer.getState().move(from, to));

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel("queue");
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setPanel]);

  const current = queue[index];
  return (
    <aside
      aria-label="Queue"
      className="jelly-panel fixed top-20 right-2 bottom-[calc(var(--player-space)+0.5rem)] z-40 flex w-[min(26rem,calc(100vw-1rem))] flex-col rounded-panel p-3 sm:right-3"
    >
      <header className="flex items-center justify-between px-1 pb-2">
        <h2 className="font-display text-xl font-bold">Queue</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={clearQueue} icon={<Trash2 className="size-4" aria-hidden="true" />}>
            Clear
          </Button>
          <button ref={closeRef} type="button" aria-label="Close queue" onClick={() => setPanel("queue")} className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div ref={scrollerRef} className={cn("min-h-0 flex-1 overflow-y-auto pr-1", drag && "select-none")}>
        {current && (
          <>
            <p className="px-1 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Now playing{source ? ` · from ${source.label}` : ""}</p>
            <ul>
              <Row item={current} index={index} isCurrent total={queue.length} drag={drag} onGrab={onGrab} rowStyle={rowStyle} />
            </ul>
          </>
        )}
        <p className="px-1 pt-4 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Next up</p>
        {index + 1 >= queue.length ? (
          <p className="px-1 py-3 text-sm text-muted">Nothing queued after this track.</p>
        ) : (
          <ul>
            {queue.slice(index + 1).map((item, k) => (
              <Row key={item.uid} item={item} index={index + 1 + k} isCurrent={false} total={queue.length} drag={drag} onGrab={onGrab} rowStyle={rowStyle} />
            ))}
          </ul>
        )}
        {index > 0 && (
          <details className="mt-4 px-1">
            <summary className="cursor-pointer text-xs font-semibold tracking-wider text-muted uppercase">Previously played ({index})</summary>
            <ul className="mt-1">
              {queue.slice(0, index).map((item, k) => (
                <Row key={item.uid} item={item} index={k} isCurrent={false} total={queue.length} drag={drag} onGrab={onGrab} rowStyle={rowStyle} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}
