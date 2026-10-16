"use client";

import { useEffect, type RefObject } from "react";

/** Pixels the mouse must move before a press becomes a drag (smaller = still a click). */
const DRAG_THRESHOLD = 6;
/** Momentum decay per 16ms frame after release. */
const FRICTION = 0.94;
/** Stop gliding below this speed (px per ms). */
const MIN_SPEED = 0.02;

/**
 * Click-and-drag horizontal scrolling with the mouse, like Jellyfin's rows.
 *
 * - Mouse only (touch, pens and trackpads already scroll natively).
 * - A press that moves less than DRAG_THRESHOLD stays a normal click.
 * - After a drag, the click that follows is swallowed, so releasing over a
 *   card doesn't open it, and native link/image dragging is disabled.
 * - On release the row glides with momentum and stays wherever it stops.
 *   Scroll-snap is switched off for the element from the first drag on;
 *   re-enabling it would yank the row to the nearest card.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let samples: { x: number; t: number }[] = [];
    let glide = 0;
    let suppressClickUntil = 0;

    const stopGlide = () => {
      cancelAnimationFrame(glide);
      glide = 0;
    };

    const endDragStyles = () => {
      // scroll-snap-type stays "none" (see above).
      el.style.removeProperty("scroll-behavior");
      el.style.removeProperty("cursor");
      el.style.removeProperty("user-select");
      delete el.dataset.dragging;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (el.scrollWidth <= el.clientWidth) return;
      // Let form controls (e.g. sliders) keep their own drag behaviour.
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true'], [data-no-drag-scroll]")) return;
      if (glide) {
        // Grabbing a gliding row stops it, and that press shouldn't click through.
        stopGlide();
        endDragStyles();
        suppressClickUntil = performance.now() + 400;
      }
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      dragging = false;
      samples = [{ x: e.clientX, t: e.timeStamp }];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        // Snap would fight the drag, and re-snapping afterwards moves the row.
        el.style.scrollSnapType = "none";
        el.style.scrollBehavior = "auto";
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
        el.dataset.dragging = "";
      }
      el.scrollLeft = startScroll - dx;
      samples.push({ x: e.clientX, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
    };

    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      suppressClickUntil = performance.now() + 400;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

      // Release velocity from the last few samples (px/ms, positive = content moves right).
      const first = samples[0];
      const last = samples[samples.length - 1];
      const recent = e.timeStamp - last.t < 80;
      let v = recent && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      if (e.type === "pointercancel" || reduceMotion.matches || Math.abs(v) < MIN_SPEED) {
        endDragStyles();
        return;
      }
      let prev = performance.now();
      const step = (now: number) => {
        const dt = Math.min(48, now - prev);
        prev = now;
        const before = el.scrollLeft;
        el.scrollLeft -= v * dt;
        v *= Math.pow(FRICTION, dt / 16);
        // Stop when slow or pinned against an end.
        if (Math.abs(v) < MIN_SPEED || el.scrollLeft === before) {
          glide = 0;
          endDragStyles();
          return;
        }
        glide = requestAnimationFrame(step);
      };
      glide = requestAnimationFrame(step);
    };

    // A drag that ends over a link/button must not activate it.
    const onClick = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = 0;
      }
    };
    // Native drag-and-drop of links/images would hijack the pointer.
    const onDragStart = (e: DragEvent) => e.preventDefault();
    const onWheel = () => {
      if (glide) {
        stopGlide();
        endDragStyles();
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
    el.addEventListener("click", onClick, true);
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      stopGlide();
      endDragStyles();
      el.style.removeProperty("scroll-snap-type");
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref]);
}
