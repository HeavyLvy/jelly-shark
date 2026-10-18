"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize, Minimize, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ICON_MAX_BYTES } from "@/lib/brand";

/** Side of the crop area on screen (CSS px). */
const VIEW = 288;
/** Exported icon size, with smaller / JPEG fallbacks if the file would exceed the upload limit. */
const OUT = 512;
const OUT_SMALL = 256;
type Rot = 0 | 90 | 180 | 270;
type Bg = "transparent" | "white" | "black";

interface View {
  scale: number;
  /** Offset of the image's centre from the frame's centre (CSS px). */
  ox: number;
  oy: number;
  rot: Rot;
}

const BACKGROUNDS: { value: Bg; label: string }[] = [
  { value: "transparent", label: "Transparent" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

/**
 * Crop-and-resize editor for the brand icon. Square frame: drag to move,
 * zoom with the slider / wheel / pinch, rotate in 90° steps, pick a background
 * for any empty area. Applying exports a square PNG (JPEG only as a last
 * resort for the size limit), so whatever was chosen, a clean small image is
 * what gets uploaded. Plain canvas, no libraries.
 */
export function ImageEditor({ source, onApply, onCancel }: { source: Blob; onApply: (file: File) => void; onCancel: () => void }) {
  const [img, setImg] = useState<{ el: HTMLImageElement; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0, rot: 0 });
  const [bg, setBg] = useState<Bg>("transparent");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const small = useRef<HTMLCanvasElement>(null);
  const tiny = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);

  // Image dimensions as shown (swapped when rotated a quarter turn).
  const dims = (rot: Rot) => (img ? (rot % 180 === 0 ? { iw: img.w, ih: img.h } : { iw: img.h, ih: img.w }) : { iw: 1, ih: 1 });
  const bounds = (rot: Rot) => {
    const { iw, ih } = dims(rot);
    const fit = Math.min(VIEW / iw, VIEW / ih);
    const cover = Math.max(VIEW / iw, VIEW / ih);
    return { fit, cover, min: fit * 0.5, max: cover * 4 };
  };

  /** Keep the image either covering the frame or inside it, never half lost off an edge. */
  const clamp = useCallback(
    (v: View): View => {
      if (!img) return v;
      const { iw, ih } = v.rot % 180 === 0 ? { iw: img.w, ih: img.h } : { iw: img.h, ih: img.w };
      const lim = (size: number) => Math.abs(size * v.scale - VIEW) / 2;
      return { ...v, ox: Math.max(-lim(iw), Math.min(lim(iw), v.ox)), oy: Math.max(-lim(ih), Math.min(lim(ih), v.oy)) };
    },
    [img],
  );

  // Load the chosen image.
  useEffect(() => {
    const url = URL.createObjectURL(source);
    const el = new Image();
    el.onload = () => {
      // SVGs without a size report 0 (or a tiny default): draw them big so they stay sharp.
      const isSvg = source.type === "image/svg+xml";
      const w = isSvg ? Math.max(el.naturalWidth, 512) : el.naturalWidth;
      const h = isSvg ? Math.max(el.naturalHeight * (w / Math.max(el.naturalWidth, 1)), 1) : el.naturalHeight;
      if (!w || !h) return setError("That image couldn't be read.");
      const cover = Math.max(VIEW / w, VIEW / h);
      setImg({ el, w, h });
      setView({ scale: cover, ox: 0, oy: 0, rot: 0 });
    };
    el.onerror = () => setError("That image couldn't be read. Try a PNG, JPEG, WebP or SVG.");
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [source]);

  /** Paint the current crop into a canvas of `size` px (also used for export and the small previews). */
  const paint = useCallback(
    (canvas: HTMLCanvasElement, size: number, withBg: Bg) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !img) return;
      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      if (withBg !== "transparent") {
        ctx.fillStyle = withBg;
        ctx.fillRect(0, 0, size, size);
      }
      const k = size / VIEW;
      ctx.save();
      ctx.translate(size / 2 + view.ox * k, size / 2 + view.oy * k);
      ctx.rotate((view.rot * Math.PI) / 180);
      ctx.scale(view.scale * k, view.scale * k);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img.el, -img.w / 2, -img.h / 2, img.w, img.h);
      ctx.restore();
    },
    [img, view],
  );

  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, Math.round(VIEW * (window.devicePixelRatio || 1)), bg);
    if (small.current) paint(small.current, 64, bg);
    if (tiny.current) paint(tiny.current, 32, bg);
  }, [paint, bg]);

  /* ---------- gestures ---------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, ox: v.ox + now.x - prev.x, oy: v.oy + now.y - prev.y }));
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist;
      const start = pinch.current.scale;
      setView((v) => {
        const { min, max } = bounds(v.rot);
        return clamp({ ...v, scale: Math.max(min, Math.min(max, start * ratio)) });
      });
    }
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const zoomBy = useCallback(
    (factor: number) =>
      setView((v) => {
        const { min, max } = bounds(v.rot);
        return clamp({ ...v, scale: Math.max(min, Math.min(max, v.scale * factor)) });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds() only reads img, which clamp already depends on
    [clamp, img],
  );

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (move) {
      e.preventDefault();
      setView((v) => clamp({ ...v, ox: v.ox + move[0], oy: v.oy + move[1] }));
    } else if (e.key === "+" || e.key === "=") zoomBy(1.1);
    else if (e.key === "-") zoomBy(1 / 1.1);
  };

  const rotate = (dir: 1 | -1) =>
    setView((v) => {
      const rot = ((v.rot + dir * 90 + 360) % 360) as Rot;
      // A quarter turn swaps the image's width and height, so re-cover the frame.
      return clamp({ scale: bounds(rot).cover, ox: 0, oy: 0, rot });
    });

  const b = bounds(view.rot);
  /** Slider position 0..1 ↔ scale, logarithmic so each step feels the same. */
  const t = Math.log(view.scale / b.min) / Math.log(b.max / b.min);
  const fitView = () => setView((v) => ({ ...v, scale: bounds(v.rot).fit, ox: 0, oy: 0 }));
  const fillView = () => setView((v) => ({ ...v, scale: bounds(v.rot).cover, ox: 0, oy: 0 }));

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const blobOf = (size: number, type: string, quality?: number, withBg: Bg = bg) =>
        new Promise<Blob | null>((resolve) => {
          const c = document.createElement("canvas");
          paint(c, size, withBg);
          c.toBlob(resolve, type, quality);
        });
      let blob = await blobOf(OUT, "image/png");
      if (!blob || blob.size > ICON_MAX_BYTES) blob = await blobOf(OUT_SMALL, "image/png");
      // Still too big (a detailed photo): JPEG on a solid background.
      if (!blob || blob.size > ICON_MAX_BYTES) blob = await blobOf(OUT, "image/jpeg", 0.9, bg === "transparent" ? "white" : bg);
      if (!blob || blob.size > ICON_MAX_BYTES) return setError("Couldn't make the image small enough. Try a simpler image.");
      onApply(new File([blob], blob.type === "image/jpeg" ? "icon.jpg" : "icon.png", { type: blob.type }));
    } finally {
      setBusy(false);
    }
  };

  // Esc cancels; focus lands on the main button.
  useEffect(() => {
    applyRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const iconBtn = "inline-flex size-9 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text";
  const seg = (active: boolean) => cn("h-8 rounded-full px-3 text-xs font-semibold transition", active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Edit icon" onClick={(e) => e.stopPropagation()} className="jelly-panel my-auto w-full max-w-md rounded-panel p-5">
        <h2 className="font-display text-xl font-bold">Edit icon</h2>
        <p className="mt-1 text-sm text-text-secondary">Drag to position, zoom to resize. The square is what gets used.</p>

        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Crop frame */}
          <div
            ref={frameRef}
            role="application"
            aria-label="Crop area. Arrow keys move the image, plus and minus zoom."
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            style={{ width: VIEW, height: VIEW }}
            className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-card ring-1 ring-hairline-strong outline-offset-2 select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-accent [background:repeating-conic-gradient(#20262e_0%_25%,#2b323b_0%_50%)_50%/16px_16px]"
          >
            <canvas ref={canvasRef} className="absolute inset-0 size-full" />
            {/* Rule-of-thirds guides */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background:linear-gradient(to_right,transparent_33%,rgb(255_255_255/.18)_33%_calc(33%+1px),transparent_calc(33%+1px)_66%,rgb(255_255_255/.18)_66%_calc(66%+1px),transparent_calc(66%+1px)),linear-gradient(to_bottom,transparent_33%,rgb(255_255_255/.18)_33%_calc(33%+1px),transparent_calc(33%+1px)_66%,rgb(255_255_255/.18)_66%_calc(66%+1px),transparent_calc(66%+1px))]" />
            {!img && !error && <span className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">Loading…</span>}
            {error && <span role="alert" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-danger">{error}</span>}
          </div>

          {/* Previews at the sizes the icon is really shown */}
          <div className="flex gap-4 sm:flex-col">
            <div>
              <p className="mb-1.5 text-xs text-muted">In the menu</p>
              <div className="flex items-center gap-2 rounded-card bg-bg/70 p-2">
                <canvas ref={small} className="size-8 rounded-[22%]" aria-label="Preview at menu size" />
                <canvas ref={tiny} className="size-4 rounded-[22%]" aria-label="Preview at browser tab size" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs text-muted">Background</p>
              <div role="group" aria-label="Background" className="flex flex-col gap-1">
                {BACKGROUNDS.map((o) => (
                  <button key={o.value} type="button" aria-pressed={bg === o.value} onClick={() => setBg(o.value)} className={seg(bg === o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center gap-1.5">
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)} className={iconBtn}>
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0}
            aria-label="Zoom"
            onChange={(e) => setView((v) => clamp({ ...v, scale: b.min * (b.max / b.min) ** Number(e.target.value) }))}
            className="jelly-range h-5 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent"
            style={{ "--pct": `${Math.min(100, Math.max(0, t * 100))}%` } as React.CSSProperties}
          />
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.15)} className={iconBtn}>
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" aria-label="Rotate left" onClick={() => rotate(-1)} className={iconBtn}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Rotate right" onClick={() => rotate(1)} className={iconBtn}>
            <RotateCw className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={fitView} className={cn(seg(false), "inline-flex items-center gap-1.5")} title="Show the whole image">
            <Minimize className="size-3.5" aria-hidden="true" /> Fit
          </button>
          <button type="button" onClick={fillView} className={cn(seg(false), "inline-flex items-center gap-1.5")} title="Fill the square">
            <Maximize className="size-3.5" aria-hidden="true" /> Fill
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <button
            ref={applyRef}
            type="button"
            onClick={() => void apply()}
            disabled={!img || busy}
            className="inline-flex h-11 items-center justify-center rounded-card bg-accent px-5 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-50"
          >
            Use this image
          </button>
        </div>
      </div>
    </div>
  );
}
