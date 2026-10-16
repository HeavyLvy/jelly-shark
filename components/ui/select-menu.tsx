"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useDismiss } from "@/components/library/use-dismiss";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** "Label ▾" glass button opening a single-select listbox (keyboard: ↑/↓, Home/End, Enter, Esc). */
export function SelectMenu<T extends string>({
  value,
  options: choices,
  onChange,
  label,
  icon,
  size = "md",
  className,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name prefix, e.g. "Sort by" → "Sort by: Name". */
  label: string;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, buttonRef);

  const current = choices.find((s) => s.value === value) ?? choices[0];

  // Move focus to the selected option when the list opens.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  const options = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  const choose = (next: T) => {
    setOpen(false);
    buttonRef.current?.focus();
    if (next !== value) onChange(next);
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = options();
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(idx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const v = items[idx]?.dataset.value as T | undefined;
        if (v) choose(v);
        break;
      }
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className={cn(
          "jelly-control inline-flex items-center gap-2 font-medium text-text transition",
          size === "sm" ? "h-8 rounded-full px-3 text-xs" : "h-10 rounded-card px-3 text-sm sm:px-4",
          open && "bg-overlay-strong",
        )}
      >
        {icon}
        <span>{current.label}</span>
        <ChevronDown className={cn("size-4 text-text-secondary transition", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="jelly-panel absolute right-0 z-30 mt-2 w-52 rounded-panel p-1.5"
        >
          {choices.map((s) => {
            const selected = s.value === value;
            return (
              <li
                key={s.value}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-value={s.value}
                onClick={() => choose(s.value)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-card px-3 py-2 text-sm outline-offset-0 transition hover:bg-overlay focus-visible:bg-overlay",
                  selected ? "font-semibold text-accent" : "text-text-secondary hover:text-text",
                )}
              >
                {s.label}
                {selected && <Check className="size-4" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
