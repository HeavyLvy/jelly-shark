/**
 * Forgiving title matching for search. Jellyfin only does substring matching,
 * so typos ("Spnge Bobo") and punctuation ("spiderman" vs "Spider-Man") find
 * nothing server-side. We match locally instead:
 *
 *  - both sides are normalised: accents, case, spaces and symbols are dropped
 *  - then ranked: exact > prefix > word start > substring > artist/series text > typo
 */

const MARKS = /\p{M}+/gu;
const NOT_ALNUM = /[^\p{L}\p{N}]+/gu;

function fold(s: string): string {
  return s.normalize("NFKD").replace(MARKS, "").toLowerCase();
}

/** "SpongeBob SquarePants!" → "spongebobsquarepants". */
export function normalize(s: string): string {
  return fold(s).replace(NOT_ALNUM, "");
}

/** Same folding, but keeps word breaks: "spongebob squarepants". */
function normalizeWords(s: string): string {
  return fold(s).split(NOT_ALNUM).filter(Boolean).join(" ");
}

/** A searchable title, pre-normalised once when the index is built. */
export interface SearchEntry {
  id: string;
  /** Normalised title. */
  n: string;
  /** Normalised title, words kept apart. */
  w: string;
  /** Normalised main secondary text: the artist or series. */
  p: string;
  /** Normalised secondary text plus extras (album…). */
  s: string;
}

export function toEntry(id: string, name: string | null | undefined, primary?: string | null, extra?: string | null): SearchEntry {
  return { id, n: normalize(name ?? ""), w: normalizeWords(name ?? ""), p: normalize(primary ?? ""), s: normalize(`${primary ?? ""} ${extra ?? ""}`) };
}

/** Typos allowed for a query: none under 4 characters, then one per 4. */
export function allowedEdits(queryLength: number): number {
  return queryLength < 4 ? 0 : Math.floor(queryLength / 4);
}

/**
 * Smallest edit distance between `q` and any part of `n` (approximate
 * substring match; a swapped pair of letters counts as one edit), or more
 * than `limit` when there isn't one that close.
 */
function minEdits(q: string, n: string, limit: number): number {
  const m = q.length;
  if (n.length + limit < m) return limit + 1;
  let older = new Uint16Array(m + 1);
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let best = prev[m];
  for (let j = 0; j < n.length; j++) {
    cur[0] = 0; // a match may start anywhere in n
    const c = n.charCodeAt(j);
    for (let i = 1; i <= m; i++) {
      const qc = q.charCodeAt(i - 1);
      const sub = prev[i - 1] + (qc === c ? 0 : 1);
      const del = prev[i] + 1;
      const ins = cur[i - 1] + 1;
      let v = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
      if (i > 1 && j > 0 && qc === n.charCodeAt(j - 1) && q.charCodeAt(i - 2) === c && older[i - 2] + 1 < v) v = older[i - 2] + 1;
      cur[i] = v;
    }
    if (cur[m] < best) best = cur[m];
    const spare = older;
    older = prev;
    prev = cur;
    cur = spare;
  }
  return best;
}

/** 0 = no match; higher is better. `q` is already normalised and non-empty. */
function score(q: string, edits: number, e: SearchEntry): number {
  if (e.n === q) return 1000;
  if (e.n.startsWith(q)) return 900 - Math.min(90, e.n.length - q.length);
  if ((" " + e.w).includes(" " + q)) return 800 - Math.min(90, e.n.length - q.length);
  const at = e.n.indexOf(q);
  if (at >= 0) return 700 - Math.min(90, at);
  // "daft punk one more time" / "one more time daft punk": artist and title together.
  if (e.p && ((e.p + e.n).includes(q) || (e.n + e.p).includes(q))) return 550;
  if (e.s && e.s.includes(q)) return 500;
  if (edits > 0) {
    const d = minEdits(q, e.n, edits);
    if (d <= edits) return 400 - d * 80;
  }
  return 0;
}

/** Best matches for `term`, best first. */
export function rankEntries(entries: readonly SearchEntry[], term: string, limit: number): SearchEntry[] {
  const q = normalize(term);
  if (!q) return [];
  const edits = allowedEdits(q.length);
  const hits: { e: SearchEntry; s: number }[] = [];
  for (const e of entries) {
    const s = score(q, edits, e);
    if (s > 0) hits.push({ e, s });
  }
  hits.sort((a, b) => b.s - a.s || a.e.n.length - b.e.n.length);
  return hits.slice(0, limit).map((h) => h.e);
}

/** How well one name matches `term` (0 = not at all). For picking a top result. */
export function scoreName(name: string | null | undefined, term: string): number {
  const q = normalize(term);
  if (!q || !name) return 0;
  return score(q, allowedEdits(q.length), toEntry("", name));
}
