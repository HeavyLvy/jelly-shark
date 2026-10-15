import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  secondary: "jelly-control text-text",
  ghost: "text-text-secondary hover:bg-overlay hover:text-text",
  outline: "jelly-control text-text",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
};

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: Variant;
  size?: Size;
  /** Fully rounded pill (default) or the 8px card radius. */
  shape?: "pill" | "card";
  icon?: ReactNode;
}

/** Shared visual styles so links can look like buttons. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  shape = "pill",
  className,
}: Pick<ButtonProps, "variant" | "size" | "shape" | "className">) {
  return cn(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap transition",
    "disabled:pointer-events-none disabled:opacity-50",
    shape === "pill" ? "rounded-full" : "rounded-card",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, shape, icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, shape, className })} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ComponentPropsWithRef<"button"> {
  /** Required: icon-only buttons need an accessible name. */
  "aria-label": string;
  variant?: "outline" | "ghost" | "solid";
  size?: "sm" | "md" | "lg";
}

const iconSizes = { sm: "size-8", md: "size-10", lg: "size-12" } as const;
const iconVariants = {
  outline: "jelly-control text-text",
  ghost: "text-text-secondary hover:bg-overlay hover:text-text",
  solid: "bg-text text-bg hover:brightness-90",
} as const;

export function IconButton({ variant = "outline", size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition",
        "disabled:pointer-events-none disabled:opacity-40",
        iconSizes[size],
        iconVariants[variant],
        className,
      )}
      {...rest}
    />
  );
}
