"use client";

import { useRef, useState } from "react";
import { Check, Moon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FloatingMenu, menuItemCls, type MenuAnchor } from "@/components/ui/floating-menu";
import { usePlayer } from "@/lib/player/store";

const OPTIONS: { label: string; value: number | "end" }[] = [
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "45 minutes", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "End of this song", value: "end" },
];

/** 🌙 Sleep timer: pause after a while or at the end of the song. Teal while set. */
export function SleepTimerButton({ className, iconClassName = "size-[18px]" }: { className?: string; iconClassName?: string }) {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const endOfTrack = usePlayer((s) => s.sleepEndOfTrack);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [opened, setOpened] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = sleepAt !== null || endOfTrack;
  // When it'll stop, read at the moment the menu opened (re-renders don't tick).
  const until = sleepAt !== null ? new Date(sleepAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  const status = endOfTrack ? "Stops after this song" : until ? `Stops at ${until} (${Math.max(1, Math.round((sleepAt! - opened) / 60_000))} min)` : null;
  const close = (opts?: { restoreFocus?: boolean }) => {
    setAnchor(null);
    if (opts?.restoreFocus) btnRef.current?.focus();
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={active ? `Sleep timer: ${status}` : "Sleep timer"}
        title={active ? status ?? "Sleep timer" : "Sleep timer"}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={() => {
          if (anchor) return setAnchor(null);
          const r = btnRef.current?.getBoundingClientRect();
          setOpened(Date.now());
          if (r) setAnchor({ x: r.right, y: r.top - 8, align: "right" });
        }}
        className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition hover:bg-overlay hover:text-text", active && "text-accent hover:text-accent", className)}
      >
        <Moon className={cn(iconClassName, active && "fill-current")} aria-hidden="true" />
      </button>
      {anchor && (
        <FloatingMenu anchor={anchor} onClose={close} label="Sleep timer" triggerRef={btnRef}>
          <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Sleep timer</p>
          {status && <p className="px-3 pb-1.5 text-xs text-accent">{status}</p>}
          {OPTIONS.map((o) => {
            const on = o.value === "end" ? endOfTrack : false;
            return (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  setSleepTimer(o.value);
                  close();
                }}
              >
                <span className="flex-1">{o.label}</span>
                {on && <Check className="size-4 text-accent" aria-hidden="true" />}
              </button>
            );
          })}
          {active && (
            <>
              <div role="separator" className="my-1 h-px bg-hairline" />
              <button
                type="button"
                role="menuitem"
                className={menuItemCls}
                onClick={() => {
                  setSleepTimer(null);
                  close();
                }}
              >
                Turn off timer
              </button>
            </>
          )}
        </FloatingMenu>
      )}
    </>
  );
}
