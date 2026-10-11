import { MIN } from "./dates";
import { sessionStart } from "./day";
import type { Session, Tasks } from "./tasks";

export const MAX_HAND = 12 * 60 * MIN;
/** Clocks are read to the minute, so touching a logged session by less than this isn't an overlap. */
const SLACK = MIN;

export interface Busy { key: string; from: number; to: number; title: string }
export type Problem = { kind: "short" | "long" | "future" } | { kind: "overlap"; with: Busy };

/** A length like "25", "25m", "1h 30m", "1h30", "1.5h", "90 min" or "1:30", in ms; null if it isn't one. */
export function parseLength(text: string): number | null {
  const s = text.trim().toLowerCase();
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (clock) return (+clock[1] * 60 + +clock[2]) * MIN;
  const m = /^(?:(\d+(?:[.,]\d+)?)\s*h[a-z]*\.?)?\s*(?:(\d+)\s*(?:m[a-z]*\.?)?)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  return Math.round((m[1] ? parseFloat(m[1].replace(",", ".")) * 60 : 0) + (m[2] ? +m[2] : 0)) * MIN;
}

/** A session entered by hand from `start` for `ms`, counting whole cycles of `focus`; `base` keeps its label and run. */
export function handSession(start: number, ms: number, focus: number, base?: Session): Session {
  const { full, cycles, ...keep } = base || ({} as Session);
  const n = focus > 0 ? Math.floor(ms / focus) : 0;
  return { ...keep, at: start + ms, ms, hand: true, ...(n ? { full: true } : {}), ...(n > 1 ? { cycles: n } : {}) };
}

/** Every logged session as a span, except the one under `skip` ("<task id>:<index>"). */
export function busySpans(tasks: Tasks, skip = ""): Busy[] {
  const out: Busy[] = [];
  for (const t of tasks.values()) (t.sessions || []).forEach((s, i) => {
    const key = t.id + ":" + i;
    if (key !== skip && s.ms) out.push({ key, from: sessionStart(s), to: s.at, title: t.system ? "Unplanned focus" : t.title });
  });
  return out;
}

const clash = (from: number, to: number, busy: Busy[]) =>
  busy.filter((b) => Math.min(to, b.to) - Math.max(from, b.from) > SLACK).sort((a, b) => a.from - b.from)[0] || null;

/** Why a session from `start` for `ms` can't be logged, or null when it can. */
export function checkSession(start: number, ms: number, busy: Busy[], now: number): Problem | null {
  if (ms < MIN) return { kind: "short" };
  if (ms > MAX_HAND) return { kind: "long" };
  if (start + ms > now) return { kind: "future" };
  const b = clash(start, start + ms, busy);
  return b ? { kind: "overlap", with: b } : null;
}

/** Where a session of `ms` most likely went: ending on the last five minutes before now, or just before whatever it would overlap. */
export function suggestStart(busy: Busy[], ms: number, now: number): number {
  const first = Math.floor(now / (5 * MIN)) * 5 * MIN - ms;
  let start = first;
  for (let i = 0; i < 50; i++) {
    const b = clash(start, start + ms, busy);
    if (!b) return start;
    start = Math.floor(b.from / MIN) * MIN - ms;
  }
  return first;
}
