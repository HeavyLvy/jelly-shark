"use client";

import Link from "next/link";
import type { BaseItemDto, MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { ChevronDown, Clapperboard, Play } from "lucide-react";
import { ArtFallback } from "@/components/media/bits";
import { JfImage } from "@/components/media/jf-image";
import { MediaRow, RowItem } from "@/components/media/media-row";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatRuntime } from "@/lib/format";
import { jf } from "@/lib/jellyfin/client";
import { pickImage } from "@/lib/jellyfin/images";
import { useJfQuery } from "@/lib/queries/use-jf-query";
import { watchHref } from "@/lib/routes";

/* ---------- trailer ---------- */

function useLocalTrailers(item: BaseItemDto) {
  const id = item.Id ?? "";
  return useJfQuery<BaseItemDto[]>({
    queryKey: ["jf", "local-trailers", id],
    enabled: !!id && (item.LocalTrailerCount ?? 0) > 0,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(jf).getLocalTrailers({ itemId: id }, { signal })).data,
  });
}

/**
 * "Trailer": plays a trailer file from your library in Jelly Shark's player, or
 * else opens the online trailer (usually YouTube) in a new tab. Hidden if none.
 */
export function TrailerButton({ item }: { item: BaseItemDto }) {
  const local = useLocalTrailers(item);
  const remote = item.RemoteTrailers?.find((t) => t.Url)?.Url;
  const cls = buttonClasses({ variant: "secondary", size: "lg", shape: "card", className: "max-sm:size-11 max-sm:rounded-full max-sm:px-0" });
  const body = (
    <>
      <Clapperboard className="size-4 max-sm:size-5" aria-hidden="true" />
      <span className="max-sm:sr-only">Trailer</span>
    </>
  );
  const localId = local.data?.[0]?.Id;
  if (localId) {
    return (
      <Link href={watchHref(localId)} aria-label="Play trailer" className={cls}>
        {body}
      </Link>
    );
  }
  if (!remote) return null;
  return (
    <a href={remote} target="_blank" rel="noopener noreferrer" aria-label="Watch trailer (opens in a new tab)" className={cls}>
      {body}
    </a>
  );
}

/* ---------- special features ---------- */

/** "Extras": behind-the-scenes, deleted scenes, featurettes… each plays in the player. */
export function ExtrasRow({ item }: { item: BaseItemDto }) {
  const id = item.Id ?? "";
  const extras = useJfQuery<BaseItemDto[]>({
    queryKey: ["jf", "special-features", id],
    enabled: !!id && (item.SpecialFeatureCount ?? 0) > 0,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(jf).getSpecialFeatures({ itemId: id }, { signal })).data,
  });
  if (!extras.data?.length) return null;
  return (
    <MediaRow title="Extras" subtitle={`${extras.data.length} special feature${extras.data.length === 1 ? "" : "s"}`}>
      {extras.data.map((x) => (
        <RowItem key={x.Id}>
          <Link href={watchHref(x.Id ?? "")} className="group block w-landscape shrink-0 rounded-card outline-offset-4">
            <div className="relative aspect-video overflow-hidden rounded-card bg-surface ring-1 ring-hairline transition group-hover:ring-hairline-strong">
              <JfImage image={pickImage(x, "landscape") ?? pickImage(x, "poster")} alt="" sizes="312px" className="absolute inset-0" fallback={<ArtFallback title={x.Name ?? "Extra"} />} />
              <span className="jelly-control absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full text-text">
                <Play className="size-3.5 fill-current" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 truncate text-sm font-medium text-text">{x.Name}</p>
            <p className="truncate text-xs text-muted">{[x.ExtraType && x.ExtraType !== "Unknown" ? x.ExtraType.replace(/([a-z])([A-Z])/g, "$1 $2") : null, formatRuntime(x.RunTimeTicks)].filter(Boolean).join(" · ")}</p>
          </Link>
        </RowItem>
      ))}
    </MediaRow>
  );
}

/* ---------- media info ---------- */

function bytes(n: number | null | undefined): string | null {
  if (!n) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i < 2 ? 0 : 1)} ${units[i]}`;
}

function bitrate(n: number | null | undefined): string | null {
  if (!n) return null;
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} Mbps` : `${Math.round(n / 1000)} kbps`;
}

function resolutionLabel(s: MediaStream): string | null {
  if (!s.Width || !s.Height) return null;
  const tier = s.Width >= 3800 ? "4K" : s.Width >= 2500 ? "1440p" : s.Width >= 1900 ? "1080p" : s.Width >= 1260 ? "720p" : s.Height >= 560 ? "576p" : "SD";
  return `${tier} (${s.Width}×${s.Height})`;
}

/**
 * Collapsible technical details of the file: container, size, bitrate, video
 * (resolution, codec, HDR, frame rate, bit depth), audio and subtitle tracks.
 */
export function MediaInfo({ item, className }: { item: BaseItemDto; className?: string }) {
  const source = item.MediaSources?.[0];
  if (!source) return null;
  const streams = source.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === "Video");
  const audio = streams.filter((s) => s.Type === "Audio");
  const subs = streams.filter((s) => s.Type === "Subtitle");
  const rows: [string, string | null][] = [
    ["Container", source.Container?.toUpperCase() ?? null],
    ["Size", bytes(source.Size)],
    ["Bitrate", bitrate(source.Bitrate)],
  ];
  if (video) {
    rows.push(
      ["Resolution", resolutionLabel(video)],
      ["Video", [video.Codec?.toUpperCase(), video.Profile, video.BitDepth ? `${video.BitDepth}-bit` : null].filter(Boolean).join(" · ") || null],
      ["Dynamic range", video.VideoRangeType && video.VideoRangeType !== "SDR" ? video.VideoRangeType : video.VideoRange ?? null],
      ["Frame rate", video.RealFrameRate ? `${Math.round(video.RealFrameRate * 100) / 100} fps` : null],
    );
  }
  return (
    <details className={cn("group rounded-panel border border-hairline", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-display text-lg font-bold [&::-webkit-details-marker]:hidden">
        Media info
        <ChevronDown className="size-5 text-text-secondary transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-6 px-5 pb-5 text-sm sm:grid-cols-2">
        <dl className="grid grid-cols-[7.5rem_1fr] content-start gap-x-4 gap-y-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-text">{v}</dd>
              </div>
            ))}
        </dl>
        <div className="space-y-4">
          {audio.length > 0 && (
            <div>
              <p className="mb-1.5 text-muted">Audio ({audio.length})</p>
              <ul className="space-y-1 text-text">
                {audio.map((s) => (
                  <li key={s.Index}>{s.DisplayTitle ?? s.Codec}</li>
                ))}
              </ul>
            </div>
          )}
          {subs.length > 0 && (
            <div>
              <p className="mb-1.5 text-muted">Subtitles ({subs.length})</p>
              <ul className="space-y-1 text-text">
                {subs.map((s) => (
                  <li key={s.Index}>{s.DisplayTitle ?? s.Codec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
