/**
 * Instance branding: name, icon and accent color. Shared by the server
 * (validation, favicon) and the browser (applying it). The built-in defaults
 * are always available: "Reset to defaults" simply deletes the saved branding.
 */

export const DEFAULT_NAME = "Jelly Shark";
export const DEFAULT_ACCENT = "#2fc7d9";
export const BRAND_NAME_MAX = 30;
/** Uploaded icon size limit (bytes). */
export const ICON_MAX_BYTES = 512 * 1024;

/** App background, for the accent contrast check. */
const BG = "#070d14";

export type BrandIcon = { kind: "preset"; preset: IconPresetId } | { kind: "upload" };

export interface Brand {
  name: string;
  /** #rrggbb */
  accent: string;
  icon: BrandIcon;
}

export const DEFAULT_BRAND: Brand = { name: DEFAULT_NAME, accent: DEFAULT_ACCENT, icon: { kind: "preset", preset: "shark" } };

/* ---------- preset icons (24×24, drawn in currentColor) ---------- */

export const ICON_PRESETS = [
  {
    id: "shark",
    label: "Shark fin",
    svg: `<path d="M4.5 16C6 10.5 9.6 5 15.6 3c-1.5 3.8-1.3 8.6.6 13Z" fill="currentColor"/><path d="M2 19.5c1.7 0 2-1.6 3.4-1.6s1.7 1.6 3.3 1.6 1.8-1.6 3.3-1.6 1.7 1.6 3.3 1.6 1.8-1.6 3.3-1.6 1.7 1.6 3.4 1.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: "jellyfish",
    label: "Jellyfish",
    svg: `<path d="M3.5 12.5a8.5 8.5 0 0 1 17 0Z" fill="currentColor"/><path d="M6 15.5v4.5M10 15.5l-.6 5.5M14 15.5l.6 5.5M18 15.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  },
  { id: "play", label: "Play", svg: `<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` },
  {
    id: "music",
    label: "Music note",
    svg: `<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.7" fill="currentColor"/><circle cx="16.5" cy="16" r="2.7" fill="currentColor"/>`,
  },
  { id: "star", label: "Star", svg: `<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>` },
  { id: "heart", label: "Heart", svg: `<path d="M12 20.5s-8-4.6-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.1c0 5.8-8 10.4-8 10.4z" fill="currentColor"/>` },
  {
    id: "tv",
    label: "Screen",
    svg: `<rect x="3" y="4.5" width="18" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20.5h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  },
] as const;

export type IconPresetId = (typeof ICON_PRESETS)[number]["id"];

export function isPresetId(v: unknown): v is IconPresetId {
  return ICON_PRESETS.some((p) => p.id === v);
}

export function presetSvg(id: IconPresetId): string {
  return (ICON_PRESETS.find((p) => p.id === id) ?? ICON_PRESETS[0]).svg;
}

/** Standalone favicon SVG for a preset: the glyph in the accent on the app's dark tile. */
export function presetFaviconSvg(id: IconPresetId, accent: string): string {
  const glyph = presetSvg(id).replaceAll("currentColor", accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.5" fill="${BG}"/><g transform="translate(2.4 2.4) scale(.8)">${glyph}</g></svg>`;
}

/* ---------- color helpers ---------- */

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum contrast of the accent against the app background, so accent text and controls stay visible. */
export const MIN_ACCENT_CONTRAST = 3;

export function accentContrast(accent: string): number {
  return contrastRatio(accent, BG);
}

/** Text color for things drawn on an accent background: whichever of dark/white reads better. */
export function onAccent(accent: string): string {
  const dark = "#04161b";
  return contrastRatio(accent, dark) >= contrastRatio(accent, "#ffffff") ? dark : "#ffffff";
}

/* ---------- validation (used by the API; the Settings form mirrors it) ---------- */

export type BrandInput = { name: string; accent: string; icon: BrandIcon };

export function parseBrand(input: unknown): { ok: true; value: BrandInput } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Invalid branding." };
  const { name, accent, icon } = input as Record<string, unknown>;
  const cleanName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!cleanName) return { ok: false, error: "Enter a name." };
  if (cleanName.length > BRAND_NAME_MAX) return { ok: false, error: `The name can be at most ${BRAND_NAME_MAX} characters.` };
  if (/[\u0000-\u001f\u007f<>]/.test(cleanName)) return { ok: false, error: "The name contains characters that aren't allowed." };
  if (!isHexColor(accent)) return { ok: false, error: "The accent color must look like #2fc7d9." };
  const hex = accent.toLowerCase();
  if (accentContrast(hex) < MIN_ACCENT_CONTRAST) return { ok: false, error: "That color is too dark to read on the dark background. Pick a lighter one." };
  const i = icon as Record<string, unknown> | null;
  if (!i || typeof i !== "object") return { ok: false, error: "Pick an icon." };
  if (i.kind === "upload") return { ok: true, value: { name: cleanName, accent: hex, icon: { kind: "upload" } } };
  if (i.kind === "preset" && isPresetId(i.preset)) return { ok: true, value: { name: cleanName, accent: hex, icon: { kind: "preset", preset: i.preset } } };
  return { ok: false, error: "Unknown icon." };
}

/* ---------- uploaded icon checks ---------- */

export type IconMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

/** Sniffs the real type from the bytes (the Content-Type header is not trusted). */
export function sniffIcon(bytes: Uint8Array): IconMime | null {
  const at = (i: number, s: string) => s.split("").every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes.length > 8 && bytes[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  const head = new TextDecoder().decode(bytes.slice(0, 2048)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Rejects SVGs that can run code or pull in other resources. (They're also served sandboxed, as a second layer.) */
export function svgProblem(text: string): string | null {
  if (/<\s*script|<\s*foreignObject|<!\s*ENTITY|<!\s*DOCTYPE|javascript:|\son[a-z]+\s*=/i.test(text)) return "That SVG contains scripts or other disallowed content.";
  if (/(href|src)\s*=\s*["']\s*(https?:|\/\/|data:text)/i.test(text) || /url\(\s*["']?\s*https?:/i.test(text)) return "That SVG references external files.";
  return null;
}
