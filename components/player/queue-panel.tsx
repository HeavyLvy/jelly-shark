"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatRuntime } from "@/lib/format";
import { usePlayer, type QueueItem } from "@/lib/player/store";
import { TrackArt } from "./track-bits";

function Row({ item, index, isCurrent, total, dragIndex, setDragIndex }: { item: QueueItem; index: number; isCurrent: boolean; total: number; dragIndex: number | null; setDragIndex: (i: number | null) => void }) {
  const { jumpTo, removeAt, move } = usePlayer.getState();
  const [over, setOver] = useState(false);
  return (
    <li
      draggable
      onDragStart={(e) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDragIndex(null)}
      onDragOver={(e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragIndex !== null) move(dragIndex, index);
        setDragIndex(null);
      }}
      className={cn(
        "group flex items-center gap-2 rounded-card py-1.5 pr-1 pl-1 transition",
        isCurrent ? "bg-overlay-strong" : "hover:bg-overlay",
        over && "ring-1 ring-accent ring-inset",
        dragIndex === index && "opacity-40",
      )}
    >
      <GripVertical className="size-4 shrink-0 cursor-grab text-muted opacity-0 group-hover:opacity-100" aria-hidden="true" />
      <button type="button" onClick={() => jumpTo(index)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-current={isCurrent ? "true" : undefined}>
        <TrackArt item={item} size={40} className="size-10" />
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-medium", isCurrent ? "text-accent" : "text-text")}>{item.Name}</span>
          <span className="block truncate text-xs text-muted">{item.Artists?.join(", ") || item.AlbumArtist}</span>
        </span>
      </button>
      <span className="hidden text-xs text-muted tabular-nums sm:inline">{formatRuntime(item.RunTimeTicks)}</span>
      <div className="flex opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button type="button" aria-label={`Move ${item.Name} up`} disabled={index === 0} onClick={() => move(index, index - 1)} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:text-text disabled:opacity-30">
          <ChevronUp className="size-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Move ${item.Name} down`} disabled={index === total - 1} onClick={() => move(index, index + 1)} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:text-text disabled:opacity-30">
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Remove ${item.Name} from queue`} onClick={() => removeAt(index)} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:text-danger">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** Slide-over queue (jelly panel): now playing, up next, reorder, remove, clear. */
export function QueuePanel() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const source = usePlayer((s) => s.source);
  const { setPanel, clearQueue } = usePlayer.getState();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {current && (
          <>
            <p className="px-1 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Now playing{source ? ` · from ${source.label}` : ""}</p>
            <ul>
              <Row item={current} index={index} isCurrent total={queue.length} dragIndex={dragIndex} setDragIndex={setDragIndex} />
            </ul>
          </>
        )}
        <p className="px-1 pt-4 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Next up</p>
        {index + 1 >= queue.length ? (
          <p className="px-1 py-3 text-sm text-muted">Nothing queued after this track.</p>
        ) : (
          <ul>
            {queue.slice(index + 1).map((item, k) => (
              <Row key={item.uid} item={item} index={index + 1 + k} isCurrent={false} total={queue.length} dragIndex={dragIndex} setDragIndex={setDragIndex} />
            ))}
          </ul>
        )}
        {index > 0 && (
          <details className="mt-4 px-1">
            <summary className="cursor-pointer text-xs font-semibold tracking-wider text-muted uppercase">Previously played ({index})</summary>
            <ul className="mt-1">
              {queue.slice(0, index).map((item, k) => (
                <Row key={item.uid} item={item} index={k} isCurrent={false} total={queue.length} dragIndex={dragIndex} setDragIndex={setDragIndex} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}
