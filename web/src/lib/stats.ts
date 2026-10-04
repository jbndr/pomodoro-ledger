import { addDays, dayKey, keyTime, sod, type DayKey } from "./dates";
import { cyclesOf, projectOf, sessionProject, type Task, type Tasks } from "./tasks";

export interface DayTotal {
  ms: number;
  cycles: number;
}

export function dayTotals(tasks: Tasks): Map<DayKey, DayTotal> {
  const m = new Map<DayKey, DayTotal>();
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const k = dayKey(s.at), o = m.get(k) || { ms: 0, cycles: 0 };
    o.ms += s.ms || 0;
    if (s.full) o.cycles++;
    m.set(k, o);
  }
  return m;
}

/** Focus time over `n` days ending with the day of `last`. */
export function sumDays(days: Map<DayKey, DayTotal>, last: number, n: number): number {
  let ms = 0;
  for (let i = 0; i < n; i++) ms += days.get(dayKey(addDays(last, -i)))?.ms || 0;
  return ms;
}

const hasCycles = (days: Map<DayKey, DayTotal>, t: number) => !!days.get(dayKey(t))?.cycles;

/** Days in a row with at least one cycle. Today without a cycle yet doesn't break the current run. */
export function streaks(days: Map<DayKey, DayTotal>, today: number): { current: number; best: number } {
  let current = 0, d = today;
  if (!hasCycles(days, d)) d = addDays(d, -1);
  while (hasCycles(days, d)) { current++; d = addDays(d, -1); }
  let best = 0, run = 0;
  const first = [...days.keys()].sort()[0];
  if (first) for (let t = keyTime(first); t <= today; t = addDays(t, 1)) {
    if (hasCycles(days, t)) best = Math.max(best, ++run);
    else run = 0;
  }
  return { current, best };
}

/** How finished tasks compared to their estimates: actual cycles over planned ones, and the difference in percent. */
export function estimateAccuracy(tasks: Iterable<Task>): { ratio: number | null; diff: number; count: number } {
  const fin = [...tasks].filter((t) => t.done && !t.system && (t.est || 0) > 0);
  const planned = fin.reduce((a, t) => a + t.est!, 0), took = fin.reduce((a, t) => a + cyclesOf(t), 0);
  const ratio = planned ? took / planned : null;
  return { ratio, diff: ratio == null ? 0 : Math.round((ratio - 1) * 100), count: fin.length };
}

export interface LabelRow {
  /** "" for no label. */
  name: string;
  ms: number;
  cycles: number;
  done: number;
  open: number;
}

/** Focus per label since a time, most first. Sessions count under their own label; tasks count as open or finished. */
export function focusByLabel(tasks: Tasks, since: number): LabelRow[] {
  const by = new Map<string, LabelRow>();
  const row = (name: string) => {
    let r = by.get(name);
    if (!r) by.set(name, (r = { name, ms: 0, cycles: 0, done: 0, open: 0 }));
    return r;
  };
  for (const t of tasks.values()) {
    const r = row(projectOf(t));
    for (const s of t.sessions || []) if (s.at >= since) {
      const l = row(sessionProject(t, s));
      l.ms += s.ms || 0;
      if (s.full) l.cycles++;
    }
    if (t.system) continue;
    if (!t.done) r.open++;
    else if ((t.doneAt || 0) >= since) r.done++;
  }
  return [...by.values()].filter((r) => r.ms || r.done).sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
}

/** Focus per label for each day, for chart tooltips. */
export function dayLabels(tasks: Tasks): Map<DayKey, Map<string, number>> {
  const m = new Map<DayKey, Map<string, number>>();
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const k = dayKey(s.at), o = m.get(k) || new Map<string, number>(), name = sessionProject(t, s);
    o.set(name, (o.get(name) || 0) + (s.ms || 0));
    m.set(k, o);
  }
  return m;
}

const STEPS = [15, 30, 60, 90, 120, 180, 240, 360];

/** Gridline step and top of a minutes axis, with at most four steps. */
export function minuteScale(max: number): { step: number; top: number } {
  const step = STEPS.find((s) => max / s <= 4) || 480;
  return { step, top: Math.ceil(max / step) * step };
}

/** Calendar shade for a day's focus minutes, 0 to 4. */
export const heatLevel = (min: number) => (min === 0 ? 0 : min < 30 ? 1 : min < 75 ? 2 : min < 150 ? 3 : 4);

/** Calendar days from a task's first session to when it was finished, counting both. */
export function spanDays(t: Task, now = Date.now()): number {
  const end = t.doneAt || now, first = (t.sessions || []).reduce((a, s) => Math.min(a, s.at), end);
  return Math.max(1, Math.round((sod(end) - sod(first)) / 864e5) + 1);
}
