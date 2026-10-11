import { addDays, MIN, sod } from "./dates";
import { breaksTaken, dayItems, runStart, type BreakEntry } from "./day";
import { weekStart } from "./insights";
import { cyclesOf, matchesLabel, sessionProject, type LabelFilter, type Session, type Task, type Tasks } from "./tasks";

export type SessionKind = "cycle" | "flow" | "over" | "early";

/** What a logged session was: a full cycle, flow, time past the bell, or a cycle stopped early. */
export const sessionKind = (s: Session): SessionKind => (s.full ? "cycle" : s.run?.startsWith("fl-") ? "flow" : s.run?.startsWith("ot-") ? "over" : "early");

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Took ÷ planned in words, to finish "Tasks take …". */
export function ratioWords(r: number): string {
  if (r < 0.9) return "less time than you plan";
  if (r < 1.1) return "about what you plan";
  if (r < 1.2) return "a little longer than you plan";
  if (r < 1.42) return "about a third longer than you plan";
  if (r < 1.7) return "about half again as long as you plan";
  if (r < 2.3) return "about twice as long as you plan";
  return Math.round(r) + " times as long as you plan";
}

/** Each label's median took ÷ planned over its finished tasks with an estimate and focus, for labels with at least two. "" is no label. */
export function labelPace(tasks: Iterable<Task>): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const t of tasks) {
    if (!t.done || t.system || !t.est || !(t.sessions || []).length) continue;
    const name = typeof t.project === "string" ? t.project.trim() : "";
    by.set(name, [...(by.get(name) || []), cyclesOf(t) / t.est]);
  }
  return new Map([...by].filter(([, r]) => r.length >= 2).map(([name, r]) => [name, median(r)]));
}

/** The usual time of day, in ms after midnight, that days with focus start, and that finished days end. Needs three days to say. */
export function usualHours(days: { from: number; to: number; done: boolean }[]): { start: number; end: number | null } | null {
  if (days.length < 3) return null;
  const ends = days.filter((d) => d.done).map((d) => d.to - sod(d.from));
  return { start: median(days.map((d) => d.from - sod(d.from))), end: ends.length >= 2 ? median(ends) : null };
}

export interface WeekLabels {
  start: number;
  ms: number;
  /** Focus per label; "" is no label. */
  by: Map<string, number>;
}

/** Focus per label for the `n` weeks up to the one containing `now`, oldest first. */
export function weekLabels(tasks: Tasks, now: number, n = 8): WeekLabels[] {
  const last = weekStart(now), weeks = [...Array(n)].map((_, i) => ({ start: addDays(last, (i - n + 1) * 7), ms: 0, by: new Map<string, number>() }));
  const first = weeks[0].start;
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    if (!s.ms || s.at < first) continue;
    const w = weeks.find((x) => s.at >= x.start && s.at < addDays(x.start, 7));
    if (!w) continue;
    const name = sessionProject(t, s);
    w.ms += s.ms;
    w.by.set(name, (w.by.get(name) || 0) + s.ms);
  }
  return weeks;
}

/** The label whose share of focus moved most between the older and the newer half of the weeks, when it moved at least five points. */
export function shareShift(weeks: WeekLabels[]): { name: string; from: number; to: number } | null {
  const half = Math.floor(weeks.length / 2), older = weeks.slice(0, half), newer = weeks.slice(half);
  const share = (ws: WeekLabels[], name: string) => {
    const all = ws.reduce((n, w) => n + w.ms, 0);
    return all ? ws.reduce((n, w) => n + (w.by.get(name) || 0), 0) / all : 0;
  };
  if (!older.some((w) => w.ms) || !newer.some((w) => w.ms)) return null;
  const names = [...new Set(weeks.flatMap((w) => [...w.by.keys()]))].filter(Boolean);
  let best: { name: string; from: number; to: number } | null = null;
  for (const name of names) {
    const from = share(older, name), to = share(newer, name);
    if (!best || Math.abs(to - from) > Math.abs(best.to - best.from)) best = { name, from, to };
  }
  return best && Math.abs(best.to - best.from) >= 0.05 ? best : null;
}

export interface Habits {
  /** Cycles and flows something followed, and how many a break followed. */
  due: number;
  taken: number;
  /** Per day, oldest first: time past the bell, cycles stopped early, and flow time. */
  over: number[];
  early: number[];
  flow: number[];
  overN: number;
  flowN: number;
  /** The label most of the stopped cycles were under; "" is no label. */
  earlyTop: string | null;
}

/** How the timer was used on each of `days`: breaks, time past the bell, stopped cycles and flow. */
export function timerHabits(tasks: Tasks, breaks: BreakEntry[] | undefined, days: number[]): Habits {
  const h: Habits = { due: 0, taken: 0, over: [], early: [], flow: [], overN: 0, flowN: 0, earlyTop: null };
  const stopped = new Map<string, number>();
  for (const day of days) {
    const items = dayItems(tasks.values(), breaks, day), b = breaksTaken(items);
    let over = 0, early = 0, flow = 0;
    h.due += b.due; h.taken += b.taken;
    for (const x of items) {
      if (x.kind !== "focus") continue;
      if (x.over) { over += x.ms; h.overN++; }
      else if (x.flow) { flow += x.ms; h.flowN++; }
      else if (!x.full) { early++; stopped.set(x.label, (stopped.get(x.label) || 0) + 1); }
    }
    h.over.push(over); h.early.push(early); h.flow.push(flow);
  }
  h.earlyTop = [...stopped].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return h;
}

/** Lengths of sessions that weren't full cycles or time past the bell, counted in `step`-minute bins; the last bin holds everything from `last` up. */
export function lengthBins(tasks: Tasks, step = 5, last = 75): { bins: number[]; flow: number[]; early: number[]; cycles: number } {
  const bins = Array<number>(last / step + 1).fill(0), flow: number[] = [], early: number[] = [];
  let cycles = 0;
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const kind = sessionKind(s);
    if (kind === "cycle") { cycles++; continue; }
    if (kind === "over" || !s.ms) continue;
    (kind === "flow" ? flow : early).push(s.ms);
    bins[Math.min(bins.length - 1, Math.floor(s.ms / MIN / step))]++;
  }
  return { bins, flow, early, cycles };
}

export interface JournalSession { key: string; from: number; to: number; ms: number; label: string; kind: SessionKind }
export interface JournalTask { id: string; title: string; label: string; ms: number; system: boolean; sessions: JournalSession[] }
export interface JournalDay { day: number; ms: number; from: number; to: number; tasks: JournalTask[] }

/** Days with focus, newest first, each with the tasks it went to (most time first) and their sessions in order. A session belongs to the day it started. */
export function journal(tasks: Tasks, filter: LabelFilter = ""): JournalDay[] {
  const days = new Map<number, JournalDay>();
  for (const t of tasks.values()) (t.sessions || []).forEach((s, i) => {
    const label = sessionProject(t, s), ms = s.ms || 0;
    if (!ms || !matchesLabel(label, filter)) return;
    const from = runStart(s.run, s.at, ms), day = sod(from);
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, ms: 0, from, to: s.at, tasks: [] }));
    let jt = d.tasks.find((x) => x.id === t.id);
    if (!jt) d.tasks.push((jt = { id: t.id, title: t.system ? "Unplanned focus" : t.title, label, ms: 0, system: !!t.system, sessions: [] }));
    jt.sessions.push({ key: t.id + ":" + i, from, to: s.at, ms, label, kind: sessionKind(s) });
    jt.ms += ms; d.ms += ms;
    d.from = Math.min(d.from, from); d.to = Math.max(d.to, s.at);
  });
  for (const d of days.values()) {
    d.tasks.sort((a, b) => b.ms - a.ms || a.title.localeCompare(b.title));
    for (const jt of d.tasks) jt.sessions.sort((a, b) => a.from - b.from);
  }
  return [...days.values()].sort((a, b) => b.day - a.day);
}
