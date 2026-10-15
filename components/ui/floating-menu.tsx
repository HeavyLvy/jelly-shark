"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface MenuAnchor {
  x: number;
  y: number;
  /** Which edge of the menu sits at x ("right" = menu extends left of x). */
  align?: "left" | "right";
}

/**
 * A menu rendered in a portal at fixed viewport coordinates (jelly glass).
 * Escapes scroll containers that would clip it and glass parents that would
 * stop its backdrop blur. Flips/clamps to stay on screen; closes on outside
 * click, Escape, scroll or resize; arrow keys move between items.
 */
export function FloatingMenu({
  anchor,
  onClose,
  label,
  id,
  children,
  className = "w-60",
  triggerRef,
}: {
  anchor: MenuAnchor;
  onClose: (opts?: { restoreFocus?: boolean }) => void;
  label: string;
  id?: string;
  children: ReactNode;
  className?: string;
  /** The button that toggles this menu: pointer-downs on it don't count as "outside". */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    let left = anchor.align === "right" ? anchor.x - width : anchor.x;
    let top = anchor.y;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, anchor.y - height - 8);
    left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
    // Only update when it actually moved (children change identity every render).
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [anchor.x, anchor.y, anchor.align, children]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || triggerRef?.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose({ restoreFocus: true });
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onResize = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose, triggerRef]);

  // Focus the first item once positioned.
  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLElement>("[role=menuitem], input")?.focus();
  }, [pos]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? "visible" : "hidden" }}
      className={`jelly-panel fixed z-[70] rounded-panel p-1.5 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Right-click state for one element: spread `onContextMenu`, render the menu when `anchor` is set. */
export function useContextMenu() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setAnchor({ x: e.clientX, y: e.clientY });
  }, []);
  return { anchor, onContextMenu, close };
}
