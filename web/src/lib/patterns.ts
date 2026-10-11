import { addDays, sod } from "./dates";
import { breaksTaken, dayItems, sessionStart, type BreakEntry } from "./day";
import { cyclesIn, matchesLabel, sessionProject, type LabelFilter, type Session, type Task, type Tasks } from "./tasks";

export type SessionKind = "cycle" | "flow" | "over" | "early" | "hand";

/** What a logged session was: a full cycle, flow, time past the bell, a cycle stopped early, or time entered by hand. */
export const sessionKind = (s: Session): SessionKind => (s.hand ? "hand" : s.full ? "cycle" : s.run?.startsWith("fl-") ? "flow" : s.run?.startsWith("ot-") ? "over" : "early");

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

/** Focus and full cycles per label for sessions that ended from `from` up to `to`; "" is no label. */
export function labelTotals(tasks: Tasks, from: number, to: number): Map<string, { ms: number; cycles: number }> {
  const by = new Map<string, { ms: number; cycles: number }>();
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    if (!s.ms || s.at < from || s.at >= to) continue;
    const name = sessionProject(t, s), r = by.get(name) || { ms: 0, cycles: 0 };
    r.ms += s.ms;
    r.cycles += cyclesIn(s);
    by.set(name, r);
  }
  return by;
}

export interface HabitSession { ms: number; title: string; label: string }

export interface Habits {
  /** For each finished cycle or flow that something followed, in order: whether a break came next. */
  breaks: boolean[];
  /** Time past the bell per day, oldest first, and how many times it happened. */
  over: number[];
  overN: number;
  stopped: HabitSession[];
  flows: HabitSession[];
  /** The label most of the stopped cycles were under; "" is no label. */
  earlyTop: string | null;
}

/** How the timer was used on each of `days`: breaks, time past the bell, stopped cycles and flow. Time entered by hand is left out. */
export function timerHabits(tasks: Tasks, breaks: BreakEntry[] | undefined, days: number[]): Habits {
  const h: Habits = { breaks: [], over: [], overN: 0, stopped: [], flows: [], earlyTop: null };
  const count = new Map<string, number>();
  for (const day of days) {
    const items = dayItems(tasks.values(), breaks, day);
    let over = 0;
    h.breaks.push(...breaksTaken(items).seq);
    for (const x of items) {
      if (x.kind !== "focus" || x.hand) continue;
      const s = { ms: x.ms, title: x.title, label: x.label };
      if (x.over) { over += x.ms; h.overN++; }
      else if (x.flow) h.flows.push(s);
      else if (!x.full) { h.stopped.push(s); count.set(x.label, (count.get(x.label) || 0) + 1); }
    }
    h.over.push(over);
  }
  h.earlyTop = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return h;
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
    const from = sessionStart(s), day = sod(from);
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
