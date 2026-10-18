"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, History, Keyboard, LogOut, Settings, UserPlus } from "lucide-react";
import { OPEN_SHORTCUTS } from "@/components/shortcuts-dialog";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { ApiError, hardNavigate } from "@/lib/api-client";
import { avatarUrl, useLogout, useMe, useSwitchAccount } from "@/lib/queries/auth";

const itemClass =
  "flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm transition hover:bg-overlay focus-visible:bg-overlay aria-disabled:opacity-50";

/** Avatar/name button with profile switching, add profile, and sign out. */
export function UserMenu() {
  const me = useMe();
  const switchAccount = useSwitchAccount();
  const logout = useLogout();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const busy = switchAccount.isPending || logout.isPending;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      return close(true);
    }
    if (e.key === "Tab") return setOpen(false);
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (idx + 1) % items.length;
    else if (e.key === "ArrowUp") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const onBlur = (e: FocusEvent) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  // Full reload: pages kept alive by <Activity> and client stores hold
  // per-user state, so a clean document is the safest identity switch.
  const afterIdentityChange = () => {
    setOpen(false);
    hardNavigate("/");
  };

  const user = me.data?.user;
  const name = user?.name ?? "";
  const error = switchAccount.error ?? logout.error;

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={name ? `Account menu for ${name}` : "Account menu"}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-9 items-center gap-2 rounded-full pr-2.5 pl-1 text-sm font-medium text-text-secondary transition hover:bg-overlay hover:text-text"
      >
        <Avatar
          name={name || "?"}
          src={user ? avatarUrl({ userId: user.id, primaryImageTag: user.primaryImageTag }) : null}
          size={28}
        />
        <span className="hidden max-w-28 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          aria-busy={busy}
          onKeyDown={onMenuKeyDown}
          className="jelly-panel absolute top-full right-0 mt-2 w-64 rounded-panel p-1.5"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase" aria-hidden="true">
            Profiles
          </p>
          {me.isPending && <p className="px-3 py-2 text-sm text-muted">Loading profiles…</p>}
          {me.isError && <p className="px-3 py-2 text-sm text-muted">Couldn&apos;t load profiles.</p>}
          {me.data?.accounts.map((a) => {
            const isActive = a.userId === user?.id;
            return (
              <button
                key={a.userId}
                type="button"
                role="menuitem"
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (busy) return;
                  if (isActive) return close(true);
                  switchAccount.mutate(a.userId, { onSuccess: afterIdentityChange });
                }}
                className={cn(itemClass, isActive ? "text-text" : "text-text-secondary")}
              >
                <Avatar name={a.name} src={avatarUrl(a)} size={28} />
                <span className="flex-1 truncate">{a.name}</span>
                {isActive && <Check className="size-4 text-accent" aria-label="Current profile" />}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/login?add=1");
            }}
            className={cn(itemClass, "text-text-secondary hover:text-text")}
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-hairline-strong">
              <UserPlus className="size-3.5" aria-hidden="true" />
            </span>
            Add profile
          </button>
          <div className="my-1.5 h-px bg-hairline" role="separator" />
          <Link role="menuitem" href="/history" onClick={() => setOpen(false)} className={cn(itemClass, "text-text-secondary hover:text-text")}>
            <History className="size-4" aria-hidden="true" />
            Watch history
          </Link>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={cn(itemClass, "text-text-secondary hover:text-text")}>
            <Settings className="size-4" aria-hidden="true" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_SHORTCUTS));
            }}
            className={cn(itemClass, "text-text-secondary hover:text-text")}
          >
            <Keyboard className="size-4" aria-hidden="true" />
            Shortcuts &amp; gestures
          </button>
          <div className="my-1.5 h-px bg-hairline" role="separator" />
          <button
            type="button"
            role="menuitem"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              logout.mutate(undefined, {
                onSuccess: ({ remaining }) => {
                  if (remaining > 0) afterIdentityChange();
                  else hardNavigate("/login");
                },
              });
            }}
            className={cn(itemClass, "text-text-secondary hover:text-text")}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {name ? `Sign out ${name}` : "Sign out"}
          </button>
          {error && (
            <p role="alert" className="px-3 pt-1 pb-2 text-sm text-danger">
              {error instanceof ApiError ? error.message : "Something went wrong. Try again."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
