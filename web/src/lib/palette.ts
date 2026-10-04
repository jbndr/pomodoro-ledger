export interface Entry {
  id: string; title: string; group: string;
  /** Extra search terms; they match without highlighting anything. */
  words?: string;
  /** Offered under Suggested when nothing is typed. */
  suggest?: boolean;
  /** Left out of the list until something is typed. */
  searchOnly?: boolean;
}

export interface Match { score: number; hits: number[] }
export interface Row<E> { item: E; hits: number[] }
export interface Section<E> { title: string; rows: Row<E>[] }
export type Usage = Record<string, { n: number; at: number }>;

const HIT = 16, BOUNDARY = 10, FIRST = 8, CONSEC = 8, GAP_OPEN = 4, GAP = 1, MID_JUMP = 6, PREFIX = 20, EXACT = 30;
const DAY = 86400000;
/** Matches scoring under this share of the best one are noise. */
const WEAK = 0.55;

const fold = (c: string) => (c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()[0] ?? c);
const foldAll = (s: string) => Array.from({ length: s.length }, (_, i) => fold(s[i]));
const wordy = /[\p{L}\p{N}]/u;

function bonus(text: string, j: number) {
  if (j === 0) return BOUNDARY + FIRST;
  const prev = text[j - 1], cur = text[j];
  if (!wordy.test(prev)) return BOUNDARY;
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase() ? BOUNDARY : 0;
}

/** The best way to find `word`'s letters in order in `text`, or null if they aren't all there. */
export function fuzzy(word: string, text: string): Match | null {
  const q = foldAll(word), t = foldAll(text), m = q.length, n = t.length;
  if (!m) return { score: 0, hits: [] };
  if (m > n) return null;
  for (let i = 0, j = 0; i < m; i++, j++) { while (j < n && t[j] !== q[i]) j++; if (j >= n) return null; }
  // at[i][j]: best score with letter i landing on j; best[i][j]: best of at[i][k <= j], less GAP per letter skipped since.
  const NO = -Infinity;
  const at = Array.from({ length: m }, () => new Float64Array(n).fill(NO));
  const from = Array.from({ length: m }, () => new Int32Array(n).fill(-1));
  let best = new Float64Array(n).fill(NO), bestAt = new Int32Array(n).fill(-1);
  for (let i = 0; i < m; i++) {
    const nextBest = new Float64Array(n).fill(NO), nextAt = new Int32Array(n).fill(-1);
    for (let j = i; j < n; j++) {
      if (t[j] === q[i]) {
        const b = bonus(text, j), own = HIT + b;
        if (i === 0) at[i][j] = own - Math.min(j, 12) * 0.5;
        else {
          const run = at[i - 1][j - 1] + CONSEC, jump = j >= 2 ? best[j - 2] - GAP_OPEN - GAP - (b ? 0 : MID_JUMP) : NO;
          if (run >= jump && run > NO) { at[i][j] = own + run; from[i][j] = j - 1; }
          else if (jump > NO) { at[i][j] = own + jump; from[i][j] = bestAt[j - 2]; }
        }
      }
      const carried = j > 0 ? nextBest[j - 1] - GAP : NO;
      if (at[i][j] >= carried) { nextBest[j] = at[i][j]; nextAt[j] = j; }
      else { nextBest[j] = carried; nextAt[j] = nextAt[j - 1]; }
    }
    best = nextBest; bestAt = nextAt;
  }
  let end = -1, score = NO;
  for (let j = m - 1; j < n; j++) if (at[m - 1][j] > score) { score = at[m - 1][j]; end = j; }
  if (end < 0) return null;
  const hits: number[] = [];
  for (let i = m - 1, j = end; i >= 0; j = from[i][j], i--) hits.unshift(j);
  const head = t.join("");
  if (head === q.join("")) score += EXACT;
  else if (head.startsWith(q.join(""))) score += PREFIX;
  return { score, hits };
}

/** Every word of `query` in `title`, in any order, or failing that among the entry's extra words. */
export function matchEntry(query: string, e: Pick<Entry, "title" | "words">): Match | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  let score = 0;
  const hits = new Set<number>();
  for (const w of words) {
    const inTitle = fuzzy(w, e.title);
    if (inTitle) { score += inTitle.score; inTitle.hits.forEach((h) => hits.add(h)); continue; }
    const inWords = e.words ? bestWord(w, e.words) : null;
    if (!inWords) return null;
    score += inWords * 0.6;
  }
  // Of two equally good matches, the one that covers more of its title wins.
  if (words.length) score += 10 * hits.size / Math.max(1, e.title.length);
  return { score, hits: [...hits].sort((a, b) => a - b) };
}

function bestWord(w: string, words: string) {
  let top = 0;
  for (const x of words.split(/\s+/)) { const m = x && fuzzy(w, x); if (m && m.score > top) top = m.score; }
  return top || null;
}

/** How much recent and frequent use lifts an entry; fades by half every week. */
export function recency(u: Usage[string] | undefined, now: number) {
  if (!u) return 0;
  return (4 + 6 * Math.log2(1 + u.n)) * 0.5 ** (Math.max(0, now - u.at) / (7 * DAY));
}

export function recordUse(usage: Usage, id: string, now: number, keep = 40): Usage {
  const next = { ...usage, [id]: { n: (usage[id]?.n || 0) + 1, at: now } };
  const ids = Object.keys(next).sort((a, b) => next[b].at - next[a].at);
  return Object.fromEntries(ids.slice(0, keep).map((k) => [k, next[k]]));
}

/** What to list for a query: Recent, Suggested and every group when it's empty, otherwise the matches grouped, best group first. */
export function arrange<E extends Entry>(items: E[], query: string, usage: Usage, now: number, o: { recent?: number; suggested?: number; perGroup?: number } = {}): Section<E>[] {
  const { recent = 4, suggested = 4, perGroup = 6 } = o;
  if (!query.trim()) {
    const used = items.filter((e) => usage[e.id]).sort((a, b) => usage[b.id].at - usage[a.id].at).slice(0, recent);
    const shown = new Set(used.map((e) => e.id));
    const picks = items.filter((e) => e.suggest && !shown.has(e.id) && !e.searchOnly).slice(0, suggested);
    picks.forEach((e) => shown.add(e.id));
    const out: Section<E>[] = [];
    if (used.length) out.push({ title: "Recent", rows: used.map((item) => ({ item, hits: [] })) });
    if (picks.length) out.push({ title: "Suggested", rows: picks.map((item) => ({ item, hits: [] })) });
    const groups = new Map<string, Row<E>[]>();
    for (const item of items) {
      if (shown.has(item.id) || item.searchOnly) continue;
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group)!.push({ item, hits: [] });
    }
    for (const [title, rows] of groups) out.push({ title, rows });
    return out;
  }
  const found = items.flatMap((item, i) => { const m = matchEntry(query, item); return m ? [{ item, i, ...m }] : []; });
  const top = Math.max(0, ...found.map((f) => f.score));
  const scored = found.filter((f) => f.score >= top * WEAK).map((f) => ({ ...f, score: f.score + recency(usage[f.item.id], now) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const groups = new Map<string, Row<E>[]>();
  for (const s of scored) {
    if (!groups.has(s.item.group)) groups.set(s.item.group, []);
    const rows = groups.get(s.item.group)!;
    if (rows.length < perGroup) rows.push({ item: s.item, hits: s.hits });
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

/** Splits `text` into runs that are and aren't matched, for highlighting. */
export function segments(text: string, hits: number[]): { text: string; hit: boolean }[] {
  const on = new Set(hits), out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = on.has(i), last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i], hit });
  }
  return out;
}
