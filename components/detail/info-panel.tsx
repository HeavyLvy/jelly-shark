import type { BaseItemDto, BaseItemPerson, MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/states";
import { dotJoin } from "@/lib/format";

export interface InfoRow {
  label: string;
  value: string;
}

/* ---------- language helpers ---------- */

/** ISO 639-2 (what Jellyfin stores) → 639-1 for compact subtitle codes. */
const ISO2: Record<string, string> = {
  eng: "en", spa: "es", fra: "fr", fre: "fr", deu: "de", ger: "de", ita: "it", por: "pt", jpn: "ja", kor: "ko",
  zho: "zh", chi: "zh", rus: "ru", ara: "ar", hin: "hi", nld: "nl", dut: "nl", swe: "sv", nor: "no", nob: "nb",
  dan: "da", fin: "fi", pol: "pl", tur: "tr", ces: "cs", cze: "cs", ell: "el", gre: "el", heb: "he", hun: "hu",
  ron: "ro", rum: "ro", tha: "th", ukr: "uk", vie: "vi", ind: "id", msa: "ms", may: "ms", bul: "bg", hrv: "hr",
  srp: "sr", slk: "sk", slo: "sk", slv: "sl", est: "et", lav: "lv", lit: "lt", isl: "is", ice: "is", cat: "ca",
  fil: "fil", tam: "ta", tel: "te",
};

function shortLang(code: string | null | undefined): string | null {
  if (!code || code === "und") return null;
  const c = code.toLowerCase();
  return (ISO2[c] ?? c).toUpperCase();
}

let displayNames: Intl.DisplayNames | null | undefined;

function languageName(code: string | null | undefined): string | null {
  if (!code || code === "und") return null;
  const c = code.toLowerCase();
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      displayNames = null;
    }
  }
  try {
    const name = displayNames?.of(ISO2[c] ?? c);
    return name && name.toLowerCase() !== c ? name : c.toUpperCase();
  } catch {
    return c.toUpperCase();
  }
}

function channelLabel(s: MediaStream): string | null {
  const layout = s.ChannelLayout?.toLowerCase();
  if (layout === "stereo") return "Stereo";
  if (layout === "mono") return "Mono";
  if (layout && /^\d/.test(layout)) return layout.replace(/\(.*\)/, "");
  if (s.Channels === 1) return "Mono";
  if (s.Channels === 2) return "Stereo";
  if (s.Channels === 6) return "5.1";
  if (s.Channels === 8) return "7.1";
  return null;
}

/* ---------- stream summaries ---------- */

/** "English 5.1 · Subtitles EN, ES +3" from an item's streams. */
export function audioSummary(streams: MediaStream[]): string | null {
  const audio = streams.filter((s) => s.Type === "Audio");
  const main = audio.find((s) => s.IsDefault) ?? audio[0];
  const audioPart = main
    ? [languageName(main.Language) ?? main.Codec?.toUpperCase() ?? "Audio", channelLabel(main)].filter(Boolean).join(" ")
    : null;
  const subs: string[] = [];
  for (const s of streams) {
    if (s.Type !== "Subtitle") continue;
    const code = shortLang(s.Language);
    if (code && !subs.includes(code)) subs.push(code);
  }
  const hasSubs = streams.some((s) => s.Type === "Subtitle");
  const shown = subs.slice(0, 4);
  const subPart = subs.length
    ? `Subtitles ${shown.join(", ")}${subs.length > shown.length ? ` +${subs.length - shown.length}` : ""}`
    : hasSubs
      ? "Subtitles"
      : null;
  return dotJoin(audioPart, subPart) || null;
}

const CODECS: Record<string, string> = { hevc: "HEVC", h265: "HEVC", h264: "H.264", avc: "H.264", av1: "AV1", vp9: "VP9", vp8: "VP8", mpeg2video: "MPEG-2", mpeg4: "MPEG-4", vc1: "VC-1" };

/** "1080p HEVC", "4K HEVC · Dolby Vision" from the main video stream. */
export function qualitySummary(streams: MediaStream[]): string | null {
  const v = streams.find((s) => s.Type === "Video");
  if (!v) return null;
  const w = v.Width ?? 0;
  const h = v.Height ?? 0;
  const res = w >= 3200 || h >= 2000 ? "4K" : w >= 1800 || h >= 1000 ? "1080p" : w >= 1200 || h >= 700 ? "720p" : h > 0 ? `${h}p` : null;
  const codec = v.Codec ? CODECS[v.Codec.toLowerCase()] ?? v.Codec.toUpperCase() : null;
  const rangeType = v.VideoRangeType ?? "";
  const range = rangeType.startsWith("DOVI") ? "Dolby Vision" : rangeType.startsWith("HDR10") ? rangeType.replace("Plus", "+") : rangeType === "HLG" ? "HLG" : null;
  return dotJoin([res, codec].filter(Boolean).join(" "), range) || null;
}

/** Streams of the first media source (falls back to the item's own list). */
export function streamsOf(item: BaseItemDto | null | undefined): MediaStream[] {
  if (!item) return [];
  return item.MediaSources?.[0]?.MediaStreams ?? item.MediaStreams ?? [];
}

/* ---------- people ---------- */

function names(people: BaseItemPerson[], type: string, max: number): string | null {
  const list = people.filter((p) => p.Type === type && p.Name).map((p) => p.Name as string);
  const unique = Array.from(new Set(list)).slice(0, max);
  return unique.length ? unique.join(", ") : null;
}

/** Starring / Created by / Directed by / Genres rows. */
export function peopleRows(item: BaseItemDto): InfoRow[] {
  const people = item.People ?? [];
  const rows: InfoRow[] = [];
  const starring = names(people, "Actor", 3);
  if (starring) rows.push({ label: "Starring", value: starring });
  const creators = names(people, "Creator", 2);
  const directors = names(people, "Director", 2);
  const writers = names(people, "Writer", 2);
  if (creators) rows.push({ label: "Created by", value: creators });
  if (directors) rows.push({ label: "Directed by", value: directors });
  if (!creators && !directors && writers) rows.push({ label: "Written by", value: writers });
  const genres = (item.Genres ?? []).slice(0, 3);
  if (genres.length) rows.push({ label: "Genres", value: genres.join(", ") });
  return rows;
}

export function streamRows(streams: MediaStream[]): InfoRow[] {
  const rows: InfoRow[] = [];
  const audio = audioSummary(streams);
  if (audio) rows.push({ label: "Audio", value: audio });
  const quality = qualitySummary(streams);
  if (quality) rows.push({ label: "Quality", value: quality });
  return rows;
}

/* ---------- panel ---------- */

/** Floating details card on the right of the hero (stacks under it on phones). */
export function InfoPanel({ rows, pendingRows = 0, className }: { rows: InfoRow[]; pendingRows?: number; className?: string }) {
  if (rows.length === 0 && pendingRows === 0) return null;
  return (
    <div className={cn("jelly-panel rounded-panel p-5", className)}>
      <h2 className="sr-only">Details</h2>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted">{r.label}</dt>
            <dd className="text-text">{r.value}</dd>
          </div>
        ))}
        {Array.from({ length: pendingRows }, (_, i) => (
          <div key={`p${i}`} className="contents" aria-hidden="true">
            <Skeleton tone="raised" className="h-4 w-16" />
            <Skeleton tone="raised" className="h-4 w-40" />
          </div>
        ))}
      </dl>
    </div>
  );
}
