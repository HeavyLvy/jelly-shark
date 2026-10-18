"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Check, Heart, Info, ListPlus, Play, Plus } from "lucide-react";
import { Button, IconButton, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/states";
import { pickImage } from "@/lib/jellyfin/images";
import { useToggleFavorite } from "@/lib/queries/items";
import { useAddToPlaylist, useCreatePlaylist, usePlaylists } from "@/lib/queries/playlists";
import { JfImage } from "./jf-image";

/**
 * Full-bleed backdrop with the design's left-to-right scrim plus a bottom
 * fade into the page background, so text stays readable over any art.
 */
export function HeroBackdrop({ item, preload, children, className }: { item: BaseItemDto; preload?: boolean; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <JfImage image={pickImage(item, "backdrop")} alt="" sizes="100vw" quality={80} preload={preload} className="absolute inset-0" imgClassName="object-[70%_20%]" />
      <div className="absolute inset-0 bg-linear-to-r from-bg via-bg/75 to-bg/0 md:via-bg/55" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-bg via-bg/60 to-bg/0" />
      <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-bg/70 to-bg/0" />
      {children}
    </div>
  );
}

/** Logo art when Jellyfin has one, otherwise the display-font title. */
export function TitleTreatment({
  item,
  as: Tag = "h1",
  className,
  logoClassName,
}: {
  item: BaseItemDto;
  as?: "h1" | "h2";
  className?: string;
  /** Sizes/aligns the logo box (default h-24 sm:h-32, max-w-md, bottom-left). */
  logoClassName?: string;
}) {
  const logo = pickImage(item, "logo");
  const name = item.Type === "Episode" ? item.SeriesName ?? item.Name : item.Name;
  const [logoFailed, setLogoFailed] = useState(false);
  if (logo && !logoFailed) {
    return (
      <Tag className={className}>
        <span className="sr-only">{name}</span>
        <LogoImage image={logo} className={logoClassName} onFail={() => setLogoFailed(true)} />
      </Tag>
    );
  }
  return (
    <Tag className={cn("font-display text-5xl leading-[0.95] font-extrabold tracking-display text-balance sm:text-6xl lg:text-7xl", className)}>
      {name}
    </Tag>
  );
}

function LogoImage({ image, className, onFail }: { image: NonNullable<ReturnType<typeof pickImage>>; className?: string; onFail: () => void }) {
  return (
    <span className={cn("relative block h-24 w-full max-w-md sm:h-32", className)} aria-hidden="true">
      <JfImage image={image} alt="" sizes="(max-width: 640px) 80vw, 560px" fit="contain" className="absolute inset-0" imgClassName="object-left-bottom" fallback={<FailNotifier onFail={onFail} />} />
    </span>
  );
}

function FailNotifier({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return null;
}

export function PlayButton({ href, label, size = "lg" }: { href: string; label: string; size?: "md" | "lg" }) {
  return (
    <Link href={href} className={buttonClasses({ variant: "primary", size, shape: "card", className: "min-w-32" })}>
      <Play className="size-4 fill-current" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function MoreInfoButton({ href, size = "lg", compactOnPhone }: { href: string; size?: "md" | "lg"; compactOnPhone?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={compactOnPhone ? "More info" : undefined}
      className={buttonClasses({ variant: "secondary", size, shape: "card", className: compactOnPhone ? "max-sm:size-11 max-sm:rounded-full max-sm:px-0" : undefined })}
    >
      <Info className={cn("size-4", compactOnPhone && "max-sm:size-5")} aria-hidden="true" />
      <span className={compactOnPhone ? "max-sm:sr-only" : undefined}>More info</span>
    </Link>
  );
}

export function FavoriteButton({ item }: { item: BaseItemDto }) {
  const toggle = useToggleFavorite();
  const fav = !!item.UserData?.IsFavorite;
  return (
    <IconButton
      size="lg"
      aria-label={fav ? `Remove ${item.Name} from favorites` : `Add ${item.Name} to favorites`}
      aria-pressed={fav}
      onClick={() => toggle.mutate({ item, favorite: !fav })}
    >
      <Heart className={cn("size-5", fav && "fill-accent text-accent")} aria-hidden="true" />
    </IconButton>
  );
}

/** "+" — add to one of the user's video playlists (or create one). */
export function AddToListButton({ item }: { item: BaseItemDto }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const playlists = usePlaylists("Video", open);
  const add = useAddToPlaylist();
  const create = useCreatePlaylist();
  const itemId = item.Id ?? "";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submitNew = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), ids: [itemId], mediaType: "Video" },
      { onSuccess: () => { setDone(name.trim()); setCreating(false); setName(""); } },
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        ref={buttonRef}
        size="lg"
        aria-label={`Add ${item.Name} to a playlist`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { setOpen((o) => !o); setDone(null); }}
      >
        <Plus className="size-5" aria-hidden="true" />
      </IconButton>
      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Add to playlist"
          className="jelly-panel absolute top-full left-0 z-30 mt-2 w-64 rounded-panel p-1.5"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Add to playlist</p>
          {playlists.isPending && <Spinner className="m-3 size-4" />}
          {playlists.isError && <p className="px-3 py-2 text-sm text-danger">Couldn&apos;t load playlists.</p>}
          {playlists.data?.length === 0 && !creating && <p className="px-3 py-2 text-sm text-muted">No video playlists yet.</p>}
          <ul>
            {playlists.data?.map((p) => (
              <li key={p.Id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => p.Id && add.mutate({ playlistId: p.Id, ids: [itemId] }, { onSuccess: () => setDone(p.Name ?? "playlist") })}
                  className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-overlay hover:text-text disabled:opacity-50"
                >
                  <ListPlus className="size-4" aria-hidden="true" />
                  <span className="flex-1 truncate">{p.Name}</span>
                </button>
              </li>
            ))}
          </ul>
          {creating ? (
            <form onSubmit={submitNew} className="flex gap-2 p-2">
              <label className="sr-only" htmlFor={`${menuId}-name`}>Playlist name</label>
              <input
                id={`${menuId}-name`}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Playlist name"
                className="h-9 min-w-0 flex-1 rounded-full border border-hairline-strong bg-bg/40 px-3 text-sm text-text placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
              />
              <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>Create</Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-overlay hover:text-text"
            >
              <Plus className="size-4" aria-hidden="true" /> New playlist
            </button>
          )}
          <p role="status" className="px-3 pb-1 text-xs text-accent">
            {done && (
              <>
                <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                Added to {done}
              </>
            )}
          </p>
          {(add.isError || create.isError) && <p role="alert" className="px-3 pb-2 text-xs text-danger">Couldn&apos;t update the playlist.</p>}
        </div>
      )}
    </div>
  );
}
