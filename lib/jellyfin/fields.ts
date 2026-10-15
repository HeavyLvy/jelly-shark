import type { ImageType, ItemFields } from "@jellyfin/sdk/lib/generated-client/models";

/** Fields every card needs (titles, sublines, art, blurhash, progress). */
export const CARD_FIELDS: ItemFields[] = [
  "PrimaryImageAspectRatio",
  "Genres",
  "DateCreated",
  "ChildCount",
  "RecursiveItemCount",
];

/** Extra fields for heroes / detail pages. */
export const DETAIL_FIELDS: ItemFields[] = [
  ...CARD_FIELDS,
  "Overview",
  "People",
  "Studios",
  "Taglines",
  "MediaSources",
  "MediaStreams",
  "ProviderIds",
  "RemoteTrailers",
  "ExternalUrls",
];

/** Image types worth fetching tags (and blurhashes) for in lists. */
export const CARD_IMAGE_TYPES: ImageType[] = ["Primary", "Backdrop", "Thumb", "Logo"];
