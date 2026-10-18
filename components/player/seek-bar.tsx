"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import { formatClock } from "@/lib/format";
import { usePlayer } from "@/lib/player/store";

/** Range input styled as a thin accent bar (seek + volume). */
export function Slider({
  value,
  max,
  onChange,
  onCommit,
  label,
  valueText,
  keyStep,
  className,
}: {
  value: number;
  max: number;
  /** Arrow-key step. step="any" would make the browser step by 1 (0 ↔ 100% on a 0–1 slider). */
  keyStep: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  valueText?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      min={0}
      max={max || 1}
      step="any"
      value={Math.min(value, max || 1)}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyDown={(e) => {
        const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const v = Math.min(Math.max(0, value + dir * keyStep), max || 1);
        onChange(v);
        onCommit?.(v);
      }}
      onKeyUp={(e) => {
        if (!e.key.startsWith("Arrow")) onCommit?.(Number((e.target as HTMLInputElement).value));
      }}
      style={{ "--pct": `${pct}%` } as CSSProperties}
      className={cn(
        "jelly-range h-4 w-full cursor-pointer appearance-none bg-transparent",
        className,
      )}
    />
  );
}

/**
 * Music seek bar. `inline` (desktop bar): times either side. `compact`
 * (phone mini bar): bar only. `stacked` (Now Playing screen): times under it.
 */
export function SeekBar({ variant = "inline" }: { variant?: "inline" | "compact" | "stacked" }) {
  const compact = variant !== "inline";
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  // While dragging, show the drag position instead of live playback time.
  const [drag, setDrag] = useState<number | null>(null);
  // Pointer hover position (fraction 0–1) for the time tooltip.
  const [hover, setHover] = useState<number | null>(null);
  const shown = drag ?? currentTime;
  return (
    <div
      className={cn(
        "flex w-full text-[11px] text-muted tabular-nums",
        variant === "stacked" ? "flex-col gap-1" : "items-center gap-2",
        variant === "compact" && "gap-0",
      )}
    >
      {!compact && <span className="w-10 text-right">{formatClock(shown)}</span>}
      <div
        className="relative flex flex-1 items-center"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {hover !== null && duration > 0 && (
          <span
            aria-hidden="true"
            className="jelly-panel pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold text-text"
            style={{ left: `${hover * 100}%` }}
          >
            {formatClock(hover * duration)}
          </span>
        )}
      <Slider
        value={shown}
        max={duration}
        label="Seek"
        keyStep={5}
        valueText={`${formatClock(shown)} of ${formatClock(duration)}`}
        onChange={setDrag}
        onCommit={(v) => {
          seek(v);
          setDrag(null);
        }}
      />
      </div>
      {!compact && <span className="w-10">{formatClock(duration)}</span>}
      {variant === "stacked" && (
        <div className="flex justify-between text-xs">
          <span>{formatClock(shown)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      )}
    </div>
  );
}
