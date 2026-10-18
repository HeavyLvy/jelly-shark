"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ICON_MAX_BYTES, ICON_PRESETS, BRAND_NAME_MAX, DEFAULT_BRAND, MIN_ACCENT_CONTRAST, accentContrast, isHexColor, onAccent, type IconPresetId } from "@/lib/brand";
import { iconUrl, setBrandState, useBrand, type BrandState } from "@/lib/brand-client";

/** Accent swatches to start from (any color works; too-dark ones are flagged). */
const SWATCHES = ["#2fc7d9", "#4da3ff", "#8b7bff", "#d36bff", "#ff6b9d", "#ff6b35", "#f5b82e", "#5fd38d"];

type Draft = { name: string; accent: string; icon: IconPresetId | "upload" };

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: string; error?: string };
    return j.detail ?? (j.error === "admin_only" ? "Only Jellyfin administrators can change the branding." : "Couldn't save. Try again.");
  } catch {
    return "Couldn't save. Try again.";
  }
}

/** Name, icon and accent color for this whole Jelly Shark instance. Administrators only (checked by the server too). */
export function BrandingSection() {
  const { brand, custom, version } = useBrand();
  const [draft, setDraft] = useState<Draft>({ name: brand.name, accent: brand.accent, icon: brand.icon.kind === "upload" ? "upload" : brand.icon.preset });
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const contrast = isHexColor(draft.accent) ? accentContrast(draft.accent) : null;
  const colorProblem = !isHexColor(draft.accent) ? "Enter a color like #2fc7d9." : contrast !== null && contrast < MIN_ACCENT_CONTRAST ? "Too dark to read on the dark background." : null;
  const nameProblem = !draft.name.trim() ? "Enter a name." : null;
  const hasUpload = draft.icon === "upload" && (file !== null || brand.icon.kind === "upload");
  const iconProblem = draft.icon === "upload" && !hasUpload ? "Choose an image to upload." : null;
  const changed = draft.name.trim() !== brand.name || draft.accent.toLowerCase() !== brand.accent || (draft.icon === "upload" ? brand.icon.kind !== "upload" || file !== null : brand.icon.kind !== "preset" || brand.icon.preset !== draft.icon);
  const valid = !nameProblem && !colorProblem && !iconProblem;
  const accent = isHexColor(draft.accent) ? draft.accent : brand.accent;

  const pickFile = (f: File | null) => {
    setMessage(null);
    if (!f) return;
    if (f.size > ICON_MAX_BYTES) return setMessage({ ok: false, text: "The icon must be 512 KB or smaller." });
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setDraft((d) => ({ ...d, icon: "upload" }));
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (file) {
        const up = await fetch("/api/branding/icon", { method: "PUT", body: file });
        if (!up.ok) return setMessage({ ok: false, text: await errorText(up) });
      }
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, accent: draft.accent, icon: draft.icon === "upload" ? { kind: "upload" } : { kind: "preset", preset: draft.icon } }),
      });
      if (!res.ok) return setMessage({ ok: false, text: await errorText(res) });
      setBrandState((await res.json()) as BrandState);
      setFile(null);
      setMessage({ ok: true, text: "Saved. Everyone on this server sees the new branding." });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/branding", { method: "DELETE" });
      if (!res.ok) return setMessage({ ok: false, text: await errorText(res) });
      const state = (await res.json()) as BrandState;
      setBrandState(state);
      setDraft({ name: DEFAULT_BRAND.name, accent: DEFAULT_BRAND.accent, icon: "shark" });
      setFile(null);
      setMessage({ ok: true, text: "Back to the defaults." });
    } finally {
      setBusy(false);
    }
  };

  const uploadSrc = fileUrl ?? (brand.icon.kind === "upload" ? iconUrl(version) : null);

  return (
    <section aria-label="Branding" className="mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight">Branding</h2>
      <p className="mb-2 text-sm text-muted">The name, icon and accent color for everyone using this server. Only Jellyfin administrators can change them. &ldquo;Reset to defaults&rdquo; restores the built-in look.</p>
      <div className="jelly-solid space-y-6 rounded-panel p-5">
        {/* Preview */}
        <div className="flex flex-wrap items-center gap-4 rounded-card bg-bg/60 p-4" aria-label="Preview">
          <span className="flex items-center gap-2.5" style={{ color: accent }}>
            {draft.icon === "upload" && uploadSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
              <img src={uploadSrc} alt="" className="size-8 rounded-[22%] object-contain" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: (ICON_PRESETS.find((p) => p.id === draft.icon) ?? ICON_PRESETS[0]).svg }} />
            )}
            <span className="font-display text-xl font-bold text-text">{draft.name.trim() || "Name"}</span>
          </span>
          <span className="inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold" style={{ background: accent, color: onAccent(accent) }}>
            Play
          </span>
          <span className="text-sm font-semibold" style={{ color: accent }}>
            Accent text
          </span>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-text">Name</span>
          <input
            value={draft.name}
            maxLength={BRAND_NAME_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="mt-1.5 block h-11 w-full max-w-sm rounded-card border border-hairline-strong bg-bg/40 px-3 text-text focus-visible:border-accent focus-visible:outline-none"
          />
          {nameProblem && <span className="mt-1 block text-xs text-danger">{nameProblem}</span>}
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-text">Icon</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ICON_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.label}
                aria-pressed={draft.icon === p.id}
                onClick={() => setDraft((d) => ({ ...d, icon: p.id }))}
                className={cn("flex size-12 items-center justify-center rounded-card border transition", draft.icon === p.id ? "border-accent bg-overlay-strong" : "border-hairline hover:bg-overlay")}
                style={{ color: accent }}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.svg }} />
              </button>
            ))}
            <button
              type="button"
              aria-pressed={draft.icon === "upload"}
              onClick={() => (uploadSrc ? setDraft((d) => ({ ...d, icon: "upload" })) : fileInput.current?.click())}
              className={cn("flex h-12 items-center gap-2 rounded-card border px-3 text-sm font-medium text-text transition", draft.icon === "upload" ? "border-accent bg-overlay-strong" : "border-hairline hover:bg-overlay")}
            >
              {uploadSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
                <img src={uploadSrc} alt="" className="size-7 rounded-[22%] object-contain" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              {uploadSrc ? "Your image" : "Upload…"}
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Upload an icon" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Upload a square PNG, JPEG, WebP or SVG up to 512 KB.{" "}
            {uploadSrc && (
              <button type="button" onClick={() => fileInput.current?.click()} className="font-semibold text-text hover:underline">
                Choose a different image
              </button>
            )}
          </p>
          {iconProblem && <span className="mt-1 block text-xs text-danger">{iconProblem}</span>}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-text">Accent color</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={draft.accent.toLowerCase() === c}
                onClick={() => setDraft((d) => ({ ...d, accent: c }))}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-surface transition", draft.accent.toLowerCase() === c && "ring-2 ring-text")}
                style={{ background: c }}
              />
            ))}
            <input type="color" aria-label="Pick any color" value={isHexColor(draft.accent) ? draft.accent : "#2fc7d9"} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))} className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
            <input
              aria-label="Accent color (hex)"
              value={draft.accent}
              maxLength={7}
              onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}` }))}
              className="h-9 w-28 rounded-card border border-hairline-strong bg-bg/40 px-2 font-mono text-sm text-text focus-visible:border-accent focus-visible:outline-none"
            />
          </div>
          {colorProblem && <span className="mt-1 block text-xs text-danger">{colorProblem}</span>}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={busy || !valid || !changed}>
            Save branding
          </Button>
          <Button variant="secondary" onClick={() => void reset()} disabled={busy || (!custom && !changed)}>
            Reset to defaults
          </Button>
          {message && (
            <span role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-text-secondary" : "text-danger")}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
