"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/states";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useMe } from "@/lib/queries/auth";

/** Fire this to open the dialog: window.dispatchEvent(new Event(OPEN_QUICK_CONNECT)). */
export const OPEN_QUICK_CONNECT = "jelly:quick-connect";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "error"; message: string };

/**
 * Approve another device's Quick Connect request without leaving Jelly Shark.
 * On the other device (a Jellyfin app, or another Jelly Shark sign-in screen)
 * choose Quick Connect to get a 6-digit code, type it here, and that device
 * signs in as the account active here.
 */
export function QuickConnectDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const me = useMe();
  const name = me.data?.user.name;

  useEffect(() => {
    const onOpen = () => {
      setCode("");
      setStatus({ kind: "idle" });
      setOpen(true);
    };
    window.addEventListener(OPEN_QUICK_CONNECT, onOpen);
    return () => window.removeEventListener(OPEN_QUICK_CONNECT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
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

  useEffect(() => {
    if (open && status.kind !== "ok") inputRef.current?.focus();
  }, [open, status.kind]);

  const submit = async (value: string) => {
    if (!/^\d{6}$/.test(value) || status.kind === "busy") return;
    setStatus({ kind: "busy" });
    try {
      await apiFetch("/api/auth/quickconnect/authorize", { method: "POST", json: { code: value } });
      setStatus({ kind: "ok" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong. Try again." });
    }
  };

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (digits === code) return; // e.g. a 7th digit typed into a full code: nothing changed, don't re-send it
    setCode(digits);
    if (status.kind === "error") setStatus({ kind: "idle" });
    if (digits.length === 6) void submit(digits);
  };

  if (!open) return null;
  const busy = status.kind === "busy";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="qc-title" onClick={(e) => e.stopPropagation()} className="jelly-panel w-full max-w-sm rounded-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-overlay-strong text-accent">
              <Smartphone className="size-5" aria-hidden="true" />
            </span>
            <h2 id="qc-title" className="font-display text-xl font-bold">
              Approve a device
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {status.kind === "ok" ? (
          <div className="mt-5 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent">
              <Check className="size-7" strokeWidth={3} aria-hidden="true" />
            </span>
            <p role="status" className="mt-4 font-semibold text-text">
              Approved
            </p>
            <p className="mt-1 text-sm text-text-secondary">The other device will sign in as {name ?? "you"} within a few seconds.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCode("");
                  setStatus({ kind: "idle" });
                }}
              >
                Approve another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-text-secondary">
              On the other device, choose <strong className="font-semibold text-text">Quick Connect</strong> on the sign-in screen (Jellyfin or Jelly Shark) and type the 6-digit code it shows.
            </p>
            <label htmlFor="qc-code" className="mt-5 block text-sm font-medium text-text">
              Code
            </label>
            <div className="relative mt-1.5">
              <input
                ref={inputRef}
                id="qc-code"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={9}
                placeholder="000000"
                disabled={busy}
                aria-invalid={status.kind === "error"}
                aria-describedby={status.kind === "error" ? "qc-error" : undefined}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit(code)}
                className="h-14 w-full rounded-card border border-hairline-strong bg-bg/40 px-4 text-center font-mono text-3xl tracking-[0.5em] text-text placeholder:text-muted/40 focus-visible:border-accent focus-visible:outline-none disabled:opacity-60"
              />
              {busy && <Spinner className="absolute top-1/2 right-4 size-5 -translate-y-1/2" label="Checking the code" />}
            </div>
            {status.kind === "error" && (
              <p id="qc-error" role="alert" className="mt-2 text-sm text-danger">
                {status.message}
              </p>
            )}
            <p className="mt-4 text-xs text-muted">
              Signing in as <span className="font-semibold text-text-secondary">{name ?? "…"}</span>. To approve as someone else, switch profile first.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
