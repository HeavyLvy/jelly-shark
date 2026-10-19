"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

const CLASS = "jelly-shell fixed top-3 left-3 z-50 flex size-11 items-center justify-center rounded-full text-text sm:hidden";

/**
 * Phone-only back circle pinned top-left (mirrors the profile circle top-right).
 * Pass `href` to go to a fixed place (the library tab a title belongs to);
 * without it, goes back in history, or Home if this page was opened directly.
 */
export function MobileBackButton({ href, label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();
  if (href) {
    return (
      <Link href={href} aria-label={label} className={CLASS}>
        <ChevronLeft className="size-7" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className={CLASS}
    >
      <ChevronLeft className="size-7" aria-hidden="true" />
    </button>
  );
}
