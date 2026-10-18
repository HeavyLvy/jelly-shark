"use client";

import { useState, type CSSProperties, type PointerEvent, type RefObject } from "react";

export interface DragState {
  from: number;
  /** Vertical offset of the dragged row (px, includes auto-scroll). */
  dy: number;
  /** Index it would land on. */
  target: number;
  /** Dragged row's height: rows it passes slide by this much to make room. */
  h: number;
}

/** Rows must carry `data-reorder-index={index}`; the grab handle should be `touch-none`. */
const ROW = "[data-reorder-index]";

/**
 * Drag-to-reorder from a handle, for touch and mouse (HTML drag-and-drop doesn't
 * work on phones). The dragged row follows the pointer, rows in between slide
 * aside, and the scroller auto-scrolls near its edges. Calls `onMove(from, to)`
 * on release.
 */
export function useDragReorder(scrollerRef: RefObject<HTMLElement | null>, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const onGrab = (e: PointerEvent<HTMLElement>, from: number) => {
    const scroller = scrollerRef.current;
    if (!scroller || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startScroll = scroller.scrollTop;
    const h = handle.closest<HTMLElement>(ROW)?.offsetHeight ?? 52;
    // Slot centres measured once, before anything moves (scroll-content coordinates).
    const slots = Array.from(scroller.querySelectorAll<HTMLElement>(ROW))
      .filter((el) => el.offsetHeight > 0)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { i: Number(el.dataset.reorderIndex), mid: b.top + b.height / 2 + scroller.scrollTop };
      });
    const fromMid = slots.find((sl) => sl.i === from)?.mid ?? startY + startScroll;
    let lastY = startY;
    let target = from;
    let raf = 0;
    const tick = () => {
      const box = scroller.getBoundingClientRect();
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, window.innerHeight);
      if (lastY < top + 56) scroller.scrollTop -= 10;
      else if (lastY > bottom - 56) scroller.scrollTop += 10;
      const dy = lastY - startY + (scroller.scrollTop - startScroll);
      const centre = fromMid + dy;
      target = slots.reduce((best, sl) => (Math.abs(sl.mid - centre) < Math.abs(best.mid - centre) ? sl : best), slots[0] ?? { i: from, mid: 0 }).i;
      setDrag({ from, dy, target, h });
      raf = requestAnimationFrame(tick);
    };
    const onPointerMove = (ev: globalThis.PointerEvent) => {
      lastY = ev.clientY;
    };
    const finish = (commit: boolean) => {
      cancelAnimationFrame(raf);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      if (commit && target !== from) onMove(from, target);
      setDrag(null);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
    raf = requestAnimationFrame(tick);
  };

  /** Inline transform for a row: follows the pointer if dragged, slides aside if passed over. */
  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (drag.from === index) return { transform: `translateY(${drag.dy}px)` };
    const shift = drag.from < index && index <= drag.target ? -drag.h : drag.target <= index && index < drag.from ? drag.h : 0;
    return shift ? { transform: `translateY(${shift}px)` } : undefined;
  };

  return { drag, onGrab, rowStyle };
}
