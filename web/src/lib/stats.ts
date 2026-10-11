import { addDays, dayKey, keyTime, sod, type DayKey } from "./dates";
import { cyclesOf, sessionProject, type Task, type Tasks } from "./tasks";

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

/** How finished tasks compared to their estimates: actual cycles over planned ones, and the difference in percent. Tasks finished without any focus logged don't count. */
export function estimateAccuracy(tasks: Iterable<Task>): { ratio: number | null; diff: number; count: number } {
  const fin = [...tasks].filter((t) => t.done && !t.system && (t.est || 0) > 0 && (t.sessions || []).length > 0);
  const planned = fin.reduce((a, t) => a + t.est!, 0), took = fin.reduce((a, t) => a + cyclesOf(t), 0);
  const ratio = planned ? took / planned : null;
  return { ratio, diff: ratio == null ? 0 : Math.round((ratio - 1) * 100), count: fin.length };
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

/** Calendar shade for a day's focus minutes, 0 to 4. */
export const heatLevel = (min: number) => (min === 0 ? 0 : min < 30 ? 1 : min < 75 ? 2 : min < 150 ? 3 : 4);

/** Calendar days from a task's first session to when it was finished, counting both. */
export function spanDays(t: Task, now = Date.now()): number {
  const end = t.doneAt || now, first = (t.sessions || []).reduce((a, s) => Math.min(a, s.at), end);
  return Math.max(1, Math.round((sod(end) - sod(first)) / 864e5) + 1);
}
