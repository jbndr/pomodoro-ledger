import { addDays, sod } from "./dates";
import { bestWindow, hourGrid, type FocusWindow } from "./insights";
import type { Tasks } from "./tasks";

export interface Span { start: number; end: number }

/** The best window of the last 90 days, when focus clusters enough to plan around it. */
export function planWindow(tasks: Tasks, now: number): FocusWindow | null {
  const w = bestWindow(hourGrid(tasks, addDays(sod(now), -89)));
  return w && w.share >= 0.3 ? w : null;
}

/** The window's run that is under way or still to come today, or null when it doesn't apply to today. */
export function windowOn(w: FocusWindow, now: number): Span | null {
  const d = new Date(now);
  for (const back of [1, 0]) {
    const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, h).getTime();
    const span = { start: at(w.from), end: at(w.to) };
    if (span.end <= now) continue;
    const weekend = new Date(span.start).getDay() % 6 === 0;
    return (w.days === "weekdays" && weekend) || (w.days === "weekends" && !weekend) ? null : span;
  }
  return null;
}

export const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** Whether at least half of a task, or half of the window, falls in the window. */
export const inWindow = (t: Span, w: Span) => overlap(t, w) * 2 >= Math.min(t.end - t.start, w.end - w.start);

/** Of the places a task could go, the one that puts the most of it in the window, closest to its start on a tie; -1 when the current place `at` is within `gain` of it. */
export function bestSlot(spans: Span[], w: Span, at: number, gain: number): number {
  let best = at;
  spans.forEach((s, i) => {
    const d = overlap(s, w) - overlap(spans[best], w);
    if (d > 60_000 || (d >= -60_000 && Math.abs(s.start - w.start) < Math.abs(spans[best].start - w.start))) best = i;
  });
  return overlap(spans[best], w) - overlap(spans[at], w) >= gain ? best : -1;
}
