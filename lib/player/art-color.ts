import type { QueueItem } from "./store";

/** Album colour from the art's blurhash (its first 4 chars after the header are the average colour). */
const B83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
export function artColor(track: QueueItem | null, alpha = 0.78): string | null {
  const hashes = track?.ImageBlurHashes?.Primary;
  const hash = hashes ? Object.values(hashes)[0] : undefined;
  if (!hash || hash.length < 6) return null;
  let v = 0;
  for (const ch of hash.slice(2, 6)) {
    const d = B83.indexOf(ch);
    if (d < 0) return null;
    v = v * 83 + d;
  }
  // Keep the art's hue, but make it a rich, dark colour (like Spotify's lyrics
  // background) so white text stays readable on any cover.
  const [r, g, b] = [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const sat = d === 0 ? 0 : Math.min(70, Math.max(38, (d / (1 - Math.abs(max + min - 1))) * 100));
  return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(sat)}% 24% / ${alpha})`;
}
