import { addDays, dayKey, sod, type DayKey } from "./dates";
import { dayTotals, streaks } from "./stats";
import { sessionProject, type Tasks } from "./tasks";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Day of the week with Monday as 0. */
export const weekday = (t: number) => (new Date(t).getDay() + 6) % 7;

export interface HourGrid {
  /** Focus in ms by weekday (Monday first), then by hour. */
  ms: number[][];
  hours: number[];
  total: number;
  sessions: number;
  days: number;
}

/** Focus by weekday and hour for sessions that ended in [since, until), split across the hours they ran in. */
export function hourGrid(tasks: Tasks, since = 0, until = Infinity): HourGrid {
  const ms = [...Array(7)].map(() => Array<number>(24).fill(0)), hours = Array<number>(24).fill(0), days = new Set<DayKey>();
  let total = 0, sessions = 0;
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    if (!s.ms || s.at < since || s.at >= until) continue;
    sessions++; total += s.ms; days.add(dayKey(s.at));
    for (let end = s.at, left = s.ms; left > 0;) {
      const d = new Date(end - 1), from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime(), part = Math.min(left, end - from);
      ms[weekday(from)][d.getHours()] += part;
      hours[d.getHours()] += part;
      left -= part; end = from;
    }
  }
  return { ms, hours, total, sessions, days: days.size };
}

/** Below this, a best time would be a guess. */
export const ENOUGH = { sessions: 8, days: 4 };

export type WindowDays = "weekdays" | "weekends" | number | null;

export interface FocusWindow {
  from: number;
  to: number;
  /** Part of all focus that falls inside the window. */
  share: number;
  days: WindowDays;
  text: string;
}

const sum = (a: number[], from = 0, to = a.length) => a.slice(from, to).reduce((x, y) => x + y, 0);

/** The run of up to four hours that holds the most focus, or null with too little history. */
export function bestWindow(g: HourGrid): FocusWindow | null {
  if (g.sessions < ENOUGH.sessions || g.days < ENOUGH.days || !g.total) return null;
  // Work from the end of the longest quiet stretch, so a window can run past midnight.
  const o = hourOrigin(g.hours), h = [...Array(24)].map((_, i) => g.hours[(o + i) % 24]);
  let from = 0;
  for (let i = 1; i < 23; i++) if (h[i] + h[i + 1] > h[from] + h[from + 1]) from = i;
  let to = from + 2;
  while (to - from < 4) {
    const mean = sum(h, from, to) / (to - from), l = from > 0 ? h[from - 1] : 0, r = to < 24 ? h[to] : 0;
    if (Math.max(l, r) < mean * 0.6) break;
    if (r >= l) to++; else from--;
  }
  const peak = Math.max(...h.slice(from, to));
  while (h[from] < peak / 4) from++;
  while (h[to - 1] < peak / 4) to--;
  const win = sum(h, from, to), share = win / g.total;
  from += o; to += o;
  const by = g.ms.map((_, d) => { let v = 0; for (let x = from; x < to; x++) v += cellAt(g, d, x); return v; });
  const weekend = (by[5] + by[6]) / win, top = by.indexOf(Math.max(...by));
  const days: WindowDays = weekend <= 0.15 ? "weekdays" : weekend >= 0.7 ? "weekends" : by[top] / win >= 0.4 ? top : null;
  return { from, to, share, days, text: windowText(from, to, days, share) };
}

/** Where the day starts for charts: midnight, or for night focus the hour right after the longest stretch without focus. */
export function hourOrigin(hours: number[]): number {
  if (!sum(hours, 20, 24) || sum(hours, 0, 5) < sum(hours) * 0.1) return 0;
  let origin = 0, gap = 0;
  for (let s = 0; s < 24; s++) {
    if (hours[s] || !hours[(s + 23) % 24]) continue;
    let n = 0;
    while (n < 24 && !hours[(s + n) % 24]) n++;
    if (n > gap) { gap = n; origin = (s + n) % 24; }
  }
  return origin;
}

/** Focus in a chart cell; hours past 23 belong to the night that started on weekday `d`. */
export const cellAt = (g: HourGrid, d: number, h: number) => (h < 24 ? g.ms[d][h] : g.ms[(d + 1) % 7][h - 24]);

const partOf = (from: number, to: number) => {
  if (from < 12 && to > 12) return "midday";
  const mid = ((from + to) / 2) % 24;
  return mid < 5 ? "night" : mid < 12 ? "morning" : mid < 17 ? "afternoon" : mid < 21 ? "evening" : "night";
};

/** A sentence naming the window, such as "You focus best 9–11 on weekday mornings." */
export function windowText(from: number, to: number, days: WindowDays, share: number): string {
  const hours = (from % 24) + "–" + (to > 24 ? to - 24 : to);
  if (share < 0.3) return "Your focus is spread across the day, most often " + hours + ".";
  const part = partOf(from, to);
  const who = days === "weekdays" ? "weekday" : days === "weekends" ? "weekend" : days == null ? "" : WEEKDAYS[days];
  const when = part === "midday"
    ? (who ? "on " + (typeof days === "number" ? who + "s" : days) + " " : "") + "around midday"
    : who ? "on " + who + " " + part + "s" : part === "night" ? "at night" : "in the " + part;
  return "You focus best " + hours + " " + when + ".";
}

/** Hours to chart: at least 8 to 18 and every hour with focus; night focus stays in one piece across midnight. */
export function hourSpan(g: HourGrid): { from: number; to: number } {
  const o = hourOrigin(g.hours), used = [...Array(24)].map((_, i) => o + i).filter((h) => g.hours[h % 24]);
  if (!used.length || used.at(-1)! < 24) return { from: Math.min(8, ...used), to: Math.max(18, ...used.map((i) => i + 1)) };
  let from = used[0], to = used.at(-1)! + 1;
  while (to - from < 10) if ((to - from) % 2) from--; else to++;
  return { from, to };
}

/** Shade 0 to 4 for a value relative to the largest one. */
export const relLevel = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((v / max) * 4))));

/** Midnight starting the week that contains `t`; `first` is the weekday weeks start on, 0 for Sunday. */
export const weekStart = (t: number, first = 1) => {
  const s = sod(t);
  return addDays(s, -((new Date(s).getDay() - first + 7) % 7));
};

export interface WeekDay { t: number; ms: number; cycles: number }

export interface WeekRecap {
  start: number;
  ms: number;
  cycles: number;
  days: WeekDay[];
  best: WeekDay | null;
  active: number;
  /** Top labels by focus; empty when nothing was labeled. "" is no label. */
  labels: { name: string; ms: number }[];
  finished: string[];
  /** Days in a row with a cycle, as of the week's last day. */
  streak: number;
  before: { ms: number; cycles: number };
}

export function weekRecap(tasks: Tasks, start: number): WeekRecap {
  const totals = dayTotals(tasks), end = addDays(start, 7);
  const week = (from: number) => [...Array(7)].map((_, i) => {
    const t = addDays(from, i), o = totals.get(dayKey(t));
    return { t, ms: o?.ms || 0, cycles: o?.cycles || 0 };
  });
  const days = week(start), prev = week(addDays(start, -7));
  const best = days.reduce<WeekDay | null>((b, d) => (d.ms && (!b || d.ms > b.ms) ? d : b), null);
  const byLabel = new Map<string, number>(), done: { at: number; title: string }[] = [];
  for (const t of tasks.values()) {
    for (const s of t.sessions || []) if (s.at >= start && s.at < end && s.ms) {
      const name = sessionProject(t, s);
      byLabel.set(name, (byLabel.get(name) || 0) + s.ms);
    }
    if (t.done && !t.system && t.doneAt && t.doneAt >= start && t.doneAt < end) done.push({ at: t.doneAt, title: t.title });
  }
  const labels = [...byLabel].some(([name]) => name) ? [...byLabel].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name)).slice(0, 3) : [];
  return {
    start, days, best, labels,
    ms: sum(days.map((d) => d.ms)),
    cycles: sum(days.map((d) => d.cycles)),
    active: days.filter((d) => d.ms).length,
    finished: done.sort((a, b) => a.at - b.at).map((d) => d.title),
    streak: streaks(totals, addDays(start, 6)).current,
    before: { ms: sum(prev.map((d) => d.ms)), cycles: sum(prev.map((d) => d.cycles)) },
  };
}

/** The week whose recap should open on this visit: last week, once per new week, if it had any focus. */
export function recapDue(tasks: Tasks, now: number, seen: string | undefined, first = 1): number | null {
  const cur = weekStart(now, first), last = addDays(cur, -7);
  if (seen === dayKey(cur)) return null;
  for (const t of tasks.values()) for (const s of t.sessions || []) if (s.at >= last && s.at < cur && s.ms) return last;
  return null;
}

/** The first week with any focus, so a recap knows how far back to go. */
export function firstWeek(tasks: Tasks, first = 1): number | null {
  let min = Infinity;
  for (const t of tasks.values()) for (const s of t.sessions || []) if (s.at < min) min = s.at;
  return min === Infinity ? null : weekStart(min, first);
}
