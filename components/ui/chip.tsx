import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const chipBase =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition";

export function chipClasses(active: boolean, className?: string) {
  return cn(
    chipBase,
    active
      ? "border-transparent bg-text text-bg"
      : "jelly-control text-text-secondary hover:text-text",
    className,
  );
}

/** Filter pill (toggle button). Active state is inverted, as in the mockups. */
export function Chip({
  active = false,
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type={type} aria-pressed={active} className={chipClasses(active, className)} {...rest} />;
}

/** Small static chip (genres in heroes). */
export function TagChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("jelly-flat inline-flex h-7 items-center rounded-full px-3 text-xs text-text-secondary", className)}>
      {children}
    </span>
  );
}

/** Chip-styled link (e.g. genre tile navigation). */
export function ChipLink({ href, active = false, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={chipClasses(active, className)}>
      {children}
    </Link>
  );
}
