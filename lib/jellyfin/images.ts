import type { BaseItemDto, ImageType } from "@jellyfin/sdk/lib/generated-client/models";
import { jfUrl } from "./client";

/**
 * Image selection per slot (brief: Primary for posters, Backdrop for heroes,
 * Logo for title treatments, Thumb for landscape cards), with the fallbacks
 * Jellyfin needs for episodes/seasons whose art lives on the parent series.
 */

export interface ImageRef {
  itemId: string;
  type: ImageType;
  tag: string;
  /** Blurhash for this exact image, when Jellyfin provides one. */
  blurhash: string | null;
  /** Primary image aspect ratio (width / height) when known. */
  aspectRatio?: number | null;
}

export type ImageSlot = "poster" | "backdrop" | "logo" | "landscape" | "square";

function hashFor(item: BaseItemDto, type: ImageType, tag: string): string | null {
  return item.ImageBlurHashes?.[type]?.[tag] ?? null;
}

function own(item: BaseItemDto, type: ImageType): ImageRef | null {
  if (!item.Id) return null;
  const tag = type === "Backdrop" ? item.BackdropImageTags?.[0] : item.ImageTags?.[type];
  return tag ? { itemId: item.Id, type, tag, blurhash: hashFor(item, type, tag), aspectRatio: item.PrimaryImageAspectRatio } : null;
}

function parentPrimary(item: BaseItemDto): ImageRef | null {
  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return { itemId: item.SeriesId, type: "Primary", tag: item.SeriesPrimaryImageTag, blurhash: hashFor(item, "Primary", item.SeriesPrimaryImageTag) };
  }
  if (item.ParentPrimaryImageItemId && item.ParentPrimaryImageTag) {
    return { itemId: item.ParentPrimaryImageItemId, type: "Primary", tag: item.ParentPrimaryImageTag, blurhash: hashFor(item, "Primary", item.ParentPrimaryImageTag) };
  }
  if (item.AlbumId && item.AlbumPrimaryImageTag) {
    return { itemId: item.AlbumId, type: "Primary", tag: item.AlbumPrimaryImageTag, blurhash: hashFor(item, "Primary", item.AlbumPrimaryImageTag) };
  }
  return null;
}

function parentBackdrop(item: BaseItemDto): ImageRef | null {
  const tag = item.ParentBackdropImageTags?.[0];
  if (item.ParentBackdropItemId && tag) {
    return { itemId: item.ParentBackdropItemId, type: "Backdrop", tag, blurhash: hashFor(item, "Backdrop", tag) };
  }
  return null;
}

function parentThumb(item: BaseItemDto): ImageRef | null {
  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    return { itemId: item.ParentThumbItemId, type: "Thumb", tag: item.ParentThumbImageTag, blurhash: hashFor(item, "Thumb", item.ParentThumbImageTag) };
  }
  return null;
}

function parentLogo(item: BaseItemDto): ImageRef | null {
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    return { itemId: item.ParentLogoItemId, type: "Logo", tag: item.ParentLogoImageTag, blurhash: null };
  }
  return null;
}

export function pickImage(item: BaseItemDto, slot: ImageSlot): ImageRef | null {
  switch (slot) {
    case "poster":
      // Episodes show their series poster in poster slots.
      return item.Type === "Episode" ? parentPrimary(item) ?? own(item, "Primary") : own(item, "Primary") ?? parentPrimary(item);
    case "square":
      return own(item, "Primary") ?? parentPrimary(item);
    case "backdrop":
      return own(item, "Backdrop") ?? parentBackdrop(item) ?? own(item, "Thumb") ?? parentThumb(item);
    case "logo":
      return own(item, "Logo") ?? parentLogo(item);
    case "landscape":
      // Episodes have their own 16:9 still as Primary.
      if (item.Type === "Episode") return own(item, "Primary") ?? parentThumb(item) ?? parentBackdrop(item);
      return own(item, "Thumb") ?? own(item, "Backdrop") ?? parentThumb(item) ?? parentBackdrop(item);
  }
}

/** Proxied URL for an image; the next/image loader appends maxWidth/quality. */
export function imageSrc(ref: ImageRef): string {
  return jfUrl(`/Items/${ref.itemId}/Images/${ref.type}`, { tag: ref.tag });
}
