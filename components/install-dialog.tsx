"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, PlusSquare, Share, X } from "lucide-react";
import { detectPlatform, OPEN_INSTALL, type InstallPlatform } from "@/lib/use-install";

const BODY: Record<InstallPlatform, { title: string; steps: ReactNode[] }> = {
  ios: {
    title: "Add to your Home Screen",
    steps: [
      <>
        Tap the <Share className="mx-0.5 inline size-4 align-text-bottom" aria-hidden="true" /> <strong>Share</strong> button in Safari&apos;s toolbar (in other browsers, open the menu first).
      </>,
      <>
        Scroll down and tap <PlusSquare className="mx-0.5 inline size-4 align-text-bottom" aria-hidden="true" /> <strong>Add to Home Screen</strong>.
      </>,
      <>
        Tap <strong>Add</strong>. Open it from the new icon: it runs full screen, without the browser bars.
      </>,
    ],
  },
  android: {
    title: "Install the app",
    steps: [
      <>
        Open the browser menu <MoreVertical className="mx-0.5 inline size-4 align-text-bottom" aria-hidden="true" />.
      </>,
      <>
        Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
      </>,
      <>Confirm, then open it from your home screen.</>,
    ],
  },
  desktop: {
    title: "Install the app",
    steps: [
      <>
        In Chrome or Edge, click the <strong>install</strong> icon at the right end of the address bar (or the browser menu → <strong>Install</strong>).
      </>,
      <>
        In Safari on a Mac, choose <strong>File → Add to Dock</strong>.
      </>,
      <>Firefox can&apos;t install web apps. Use a bookmark, or another browser.</>,
    ],
  },
};

/**
 * "How to install" steps for browsers that can't install with one tap (all of
 * iOS, and anywhere the browser hasn't offered an install prompt). Opened by
 * OPEN_INSTALL, which useInstall().install() fires when there is no prompt.
 */
export function InstallDialog() {
  const [open, setOpen] = useState(false);
  // Detected when it opens (never during the server render).
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [secure, setSecure] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setPlatform(detectPlatform());
      setSecure(window.isSecureContext);
      setOpen(true);
    };
    window.addEventListener(OPEN_INSTALL, onOpen);
    return () => window.removeEventListener(OPEN_INSTALL, onOpen);
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
  const { title, steps } = BODY[platform];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()} className="jelly-panel max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="install-title" className="font-display text-2xl font-bold">
            {title}
          </h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-overlay hover:text-text">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-text-secondary marker:font-semibold marker:text-text">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {!secure && platform !== "ios" && (
          <p className="mt-4 rounded-card bg-overlay p-3 text-sm text-text-secondary">
            This address isn&apos;t HTTPS, so the browser can only add a shortcut, not a full app. Serving Jelly Shark over HTTPS (for example behind a reverse proxy) enables the real install.
          </p>
        )}
      </div>
    </div>
  );
}
