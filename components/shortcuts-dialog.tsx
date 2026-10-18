"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** Fire this to open the dialog from a menu: window.dispatchEvent(new Event(OPEN_SHORTCUTS)). */
export const OPEN_SHORTCUTS = "jelly:shortcuts";

const GROUPS: { title: string; items: [keys: string[], action: string][] }[] = [
  {
    title: "Video player",
    items: [
      [["Space", "K"], "Play / pause"],
      [["←", "J"], "Back 10 seconds"],
      [["→", "L"], "Forward 10 seconds"],
      [["↑", "↓"], "Volume up / down 5%"],
      [["M"], "Mute"],
      [["C"], "Subtitles on / off"],
      [["F", "F11"], "Full screen"],
      [["Esc"], "Close a menu"],
    ],
  },
  {
    title: "Music",
    items: [
      [["Space"], "Play / pause"],
      [["←", "→"], "Back / forward 5 seconds"],
      [["↑", "↓"], "Volume up / down 5%"],
      [["Esc"], "Close lyrics, queue or Now Playing"],
    ],
  },
  {
    title: "Anywhere",
    items: [
      [["?"], "Show this list"],
      [["Enter"], "Search now (in a search box)"],
    ],
  },
  {
    title: "Touch",
    items: [
      [["Tap"], "Show / hide video controls"],
      [["Double-tap ◀ ▶"], "Back / forward 10 seconds (left / right of the video)"],
      [["Swipe"], "Change the featured title on Home"],
      [["Drag ≡"], "Reorder the queue or a playlist"],
      [["Drag down"], "Close Now Playing"],
      [["Long-press"], "More options (favourite, watched, add to playlist…)"],
    ],
  },
];

/** "?" opens a list of every keyboard shortcut (and touch gesture). */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !t?.closest("input, textarea, select, [contenteditable='true']")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        className="jelly-panel max-h-[85dvh] w-full max-w-3xl overflow-y-auto rounded-panel p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="shortcuts-title" className="font-display text-2xl font-bold">
            Shortcuts &amp; gestures
          </h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">{g.title}</h3>
              <dl className="space-y-2 text-sm">
                {g.items.map(([keys, action]) => (
                  <div key={action} className="flex items-center justify-between gap-4">
                    <dt className="text-text-secondary">{action}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {keys.map((k) => (
                        <kbd key={k} className="min-w-7 rounded-md border border-hairline-strong bg-overlay px-1.5 py-0.5 text-center font-sans text-xs font-semibold text-text">
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
