import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge taught our @theme tokens (app/globals.css), so e.g.
 * `text-on-accent` is a color (not a font size) and a caller's
 * `absolute` / `rounded-full` overrides a component's default.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "bg",
        "bg-music",
        "surface",
        "surface-raised",
        "text",
        "text-secondary",
        "muted",
        "accent",
        "on-accent",
        "star",
        "danger",
        "hairline",
        "hairline-strong",
        "scrim",
        "overlay",
        "overlay-strong",
        "avatar",
        "tile-1",
        "tile-2",
        "tile-3",
        "tile-4",
        "tile-5",
        "tile-6",
        "tile-7",
        "tile-8",
      ],
      radius: ["card", "panel"],
      spacing: ["poster", "landscape", "album"],
      tracking: ["display"],
    },
  },
});

/** Joins class names (skipping falsy values); later classes win conflicts. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
