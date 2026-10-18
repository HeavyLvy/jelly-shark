"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { SelectMenu } from "@/components/ui/select-menu";
import { Switch } from "@/components/ui/switch";
import { QUALITY_OPTIONS, SUBTITLE_SIZES, readVideoPrefs, writeVideoPrefs, type VideoPrefs } from "@/lib/player/video-prefs";
import { HOME_ROWS, posterWidthFor, setUiPrefs, useUiPrefs, type PosterSize } from "@/lib/ui-prefs";
import { useSettingsVersion } from "@/lib/settings-sync";
import { useIsClient } from "@/lib/use-is-client";

const GUTTER = "px-4 sm:px-8 lg:px-11";

/** ISO 639-2 codes (what Jellyfin stores on streams) offered as language preferences. */
const LANGS = ["eng", "spa", "fra", "deu", "ita", "por", "nld", "swe", "nor", "dan", "fin", "pol", "rus", "ukr", "tur", "ara", "hin", "jpn", "kor", "zho"];
const TWO: Record<string, string> = { eng: "en", spa: "es", fra: "fr", deu: "de", ita: "it", por: "pt", nld: "nl", swe: "sv", nor: "no", dan: "da", fin: "fi", pol: "pl", rus: "ru", ukr: "uk", tur: "tr", ara: "ar", hin: "hi", jpn: "ja", kor: "ko", zho: "zh" };

function langName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(TWO[code] ?? code) ?? code;
  } catch {
    return code;
  }
}

/** Settings: playback, languages, subtitles, appearance and Home rows. Saved in this browser. */
export function SettingsView() {
  const isClient = useIsClient();
  // Remounts when the server copy arrives, so the controls show the saved values.
  const version = useSettingsVersion();
  if (!isClient) return <div className={`mx-auto max-w-3xl pt-28 ${GUTTER}`} />;
  return <SettingsBody key={version} />;
}

function SettingsBody() {
  const [prefs, setPrefs] = useState<VideoPrefs>(() => readVideoPrefs());
  const ui = useUiPrefs();
  const update = (patch: Partial<VideoPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    writeVideoPrefs(patch);
  };
  const langOptions = LANGS.map((c) => ({ value: c, label: langName(c) }));
  const seg = (active: boolean) => cn("h-9 rounded-full px-4 text-sm font-semibold transition", active ? "bg-text text-bg" : "text-text-secondary hover:bg-overlay hover:text-text");

  return (
    <div className={`mx-auto max-w-3xl pt-28 pb-20 ${GUTTER}`}>
      <h1 className="font-display text-4xl font-extrabold tracking-display sm:text-5xl">Settings</h1>
      <p className="mt-2 text-sm text-text-secondary">Saved in this browser.</p>

      <Section title="Playback">
        <Row label="Autoplay next episode" hint="Count down and play the next episode when one ends.">
          <Switch label="Autoplay next episode" checked={prefs.autoplayNext} onChange={(v) => update({ autoplayNext: v })} />
        </Row>
        <Row label="Default quality" hint="Auto plays the original when your device can, converting only when needed.">
          <SelectMenu
            value={String(prefs.maxBitrate ?? "auto")}
            options={QUALITY_OPTIONS.map((q) => ({ value: String(q.value ?? "auto"), label: q.label }))}
            onChange={(v) => update({ maxBitrate: v === "auto" ? null : Number(v) })}
            label="Default quality"
            size="sm"
          />
        </Row>
        <Row label="Native player controls" hint="Use your device's own video controls instead of Jelly Shark's.">
          <Switch label="Native player controls" checked={prefs.nativeControls} onChange={(v) => update({ nativeControls: v })} />
        </Row>
      </Section>

      <Section title="Languages">
        <Row label="Audio" hint="Picked when a video has this language; otherwise the file's default track.">
          <SelectMenu value={prefs.audioLang ?? "default"} options={[{ value: "default", label: "File default" }, ...langOptions]} onChange={(v) => update({ audioLang: v === "default" ? null : v })} label="Audio language" size="sm" />
        </Row>
        <Row label="Subtitles" hint="Turned on automatically when a video has them in this language.">
          <SelectMenu
            value={prefs.subtitleLang}
            options={[{ value: "off", label: "Off" }, ...langOptions]}
            onChange={(v) => update(v === "off" ? { subtitleLang: "off" } : { subtitleLang: v, lastSubtitleLang: v })}
            label="Subtitle language"
            size="sm"
          />
        </Row>
      </Section>

      <Section title="Subtitle appearance">
        <Row label="Size" wide>
          <div role="group" aria-label="Subtitle size" className="flex gap-1">
            {SUBTITLE_SIZES.map((s) => (
              <button key={s.value} type="button" aria-pressed={prefs.subtitleSize === s.value} onClick={() => update({ subtitleSize: s.value })} className={seg(prefs.subtitleSize === s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Background" wide>
          <div role="group" aria-label="Subtitle background" className="flex gap-1">
            <button type="button" aria-pressed={prefs.subtitleStyle === "box"} onClick={() => update({ subtitleStyle: "box" })} className={seg(prefs.subtitleStyle === "box")}>
              Box
            </button>
            <button type="button" aria-pressed={prefs.subtitleStyle === "shadow"} onClick={() => update({ subtitleStyle: "shadow" })} className={seg(prefs.subtitleStyle === "shadow")}>
              Shadow
            </button>
          </div>
        </Row>
        {/* Preview (approximates the video's caption rendering). */}
        <div className="mt-2 flex h-28 items-end justify-center rounded-card bg-[linear-gradient(135deg,#1d3b4f,#3b2a4f)] pb-4">
          <span
            className={cn("px-1.5 text-white", prefs.subtitleStyle === "box" ? "bg-black/80" : "[text-shadow:0_0_4px_#000,0_1px_3px_#000]")}
            style={{ fontSize: { small: "0.85rem", medium: "1.05rem", large: "1.35rem", xlarge: "1.7rem" }[prefs.subtitleSize] }}
          >
            This is how subtitles will look
          </span>
        </div>
      </Section>

      <Section title="Appearance">
        <Row wide label="Poster size" hint={`Posters across rows, Library and search (${posterWidthFor(ui.posterSize)}px).`}>
          <div role="group" aria-label="Poster size" className="flex gap-1">
            {(["small", "default", "large"] as PosterSize[]).map((s) => (
              <button key={s} type="button" aria-pressed={ui.posterSize === s} onClick={() => setUiPrefs({ posterSize: s })} className={cn(seg(ui.posterSize === s), "capitalize")}>
                {s}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Home">
        {HOME_ROWS.map((r) => {
          const on = !ui.hiddenRows.includes(r.id);
          return (
            <Row key={r.id} label={r.label}>
              <Switch label={`Show ${r.label}`} checked={on} onChange={(v) => setUiPrefs({ hiddenRows: v ? ui.hiddenRows.filter((x) => x !== r.id) : [...ui.hiddenRows, r.id] })} />
            </Row>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="mb-2 font-display text-xl font-bold tracking-tight">{title}</h2>
      <div className="jelly-solid divide-y divide-hairline rounded-panel px-5">{children}</div>
    </section>
  );
}

/** A setting: label (+ hint) on the left, its control on the right. `wide` controls wrap below on small screens. */
function Row({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-x-6 gap-y-3 py-4", wide && "flex-wrap")}>
      <div className={cn("min-w-0 flex-1", wide && "basis-56")}>
        <p className="font-medium text-text">{label}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
