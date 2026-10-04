import { addDays, dayKey, keyTime, type DayKey } from "./dates";
import { bestWindow, ENOUGH, hourGrid, weekday, type FocusWindow } from "./insights";
import type { DayTotal } from "./stats";
import { sessionProject, type Tasks } from "./tasks";

export interface YearLabel { name: string; ms: number; cycles: number }
export interface Run { days: number; from: number; to: number }
export interface Block { from: number; to: number }
export interface BusyDay { t: number; ms: number; cycles: number; blocks: Block[] }
export type Persona = "morning" | "afternoon" | "evening" | "night";

export interface YearStats {
  year: number;
  start: number;
  /** Now for the current year, else the next New Year. */
  end: number;
  partial: boolean;
  ms: number;
  cycles: number;
  sessions: number;
  days: Map<DayKey, DayTotal>;
  active: number;
  /** Focus per month in ms, January first. */
  months: number[];
  bestMonth: number | null;
  /** Named labels only, most focus first. */
  labels: YearLabel[];
  /** Focus per hour of day, split across the hours a session ran in. */
  hours: number[];
  window: FocusWindow | null;
  persona: Persona | null;
  streak: Run | null;
  busiest: BusyDay | null;
  weekendDays: number;
  /** Full cycles started 4–8 am, and 9 pm–4 am. */
  early: number;
  late: number;
  finished: number;
  /** The longest break between two days with focus. */
  gap: { days: number; back: number } | null;
}

const startHour = (s: { at: number; ms?: number }) => new Date(s.at - (s.ms || 0)).getHours();

/** Years with any focus, oldest first. */
export function focusYears(tasks: Tasks): number[] {
  const ys = new Set<number>();
  for (const t of tasks.values()) for (const s of t.sessions || []) if (s.ms) ys.add(new Date(s.at).getFullYear());
  return [...ys].sort((a, b) => a - b);
}

const PARTS: [Persona, number, number][] = [["morning", 5, 12], ["afternoon", 12, 17], ["evening", 17, 21]];

export function personaOf(hours: number[]): Persona | null {
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const share = (from: number, to: number) => hours.slice(from, to).reduce((a, b) => a + b, 0);
  const parts: [Persona, number][] = [...PARTS.map(([p, f, t]): [Persona, number] => [p, share(f, t)]), ["night", share(21, 24) + share(0, 5)]];
  return parts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

export function yearStats(tasks: Tasks, year: number, now = Date.now()): YearStats {
  const start = new Date(year, 0, 1).getTime(), next = new Date(year + 1, 0, 1).getTime(), end = Math.min(next, now);
  const days = new Map<DayKey, DayTotal>(), months = Array<number>(12).fill(0), byLabel = new Map<string, YearLabel>();
  const blocks = new Map<DayKey, Block[]>();
  let ms = 0, cycles = 0, sessions = 0, early = 0, late = 0, finished = 0;
  for (const t of tasks.values()) {
    for (const s of t.sessions || []) {
      if (!s.ms || s.at < start || s.at >= next) continue;
      const k = dayKey(s.at), d = days.get(k) || { ms: 0, cycles: 0 }, name = sessionProject(t, s);
      sessions++; ms += s.ms; d.ms += s.ms; months[new Date(s.at).getMonth()] += s.ms;
      if (s.full) {
        cycles++; d.cycles++;
        const h = startHour(s);
        if (h >= 4 && h < 8) early++;
        else if (h >= 21 || h < 4) late++;
      }
      days.set(k, d);
      (blocks.get(k) || blocks.set(k, []).get(k)!).push({ from: s.at - s.ms, to: s.at });
      if (name) {
        const l = byLabel.get(name) || { name, ms: 0, cycles: 0 };
        l.ms += s.ms; if (s.full) l.cycles++;
        byLabel.set(name, l);
      }
    }
    if (t.done && !t.system && t.doneAt && t.doneAt >= start && t.doneAt < next) finished++;
  }
  const g = hourGrid(tasks, start, next);
  const keys = [...days.keys()].sort();
  const top = keys.reduce<DayKey | null>((b, k) => (!b || days.get(k)!.ms > days.get(b)!.ms ? k : b), null);
  const best = Math.max(...months);
  return {
    year, start, end, partial: now < next,
    ms, cycles, sessions, days, active: keys.length, months,
    bestMonth: best > 0 ? months.indexOf(best) : null,
    labels: [...byLabel.values()].sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name)),
    hours: g.hours,
    window: bestWindow(g),
    persona: g.sessions >= ENOUGH.sessions && g.days >= ENOUGH.days ? personaOf(g.hours) : null,
    streak: longestRun(days, start, end),
    busiest: top ? { t: keyTime(top), ...days.get(top)!, blocks: blocks.get(top)!.sort((a, b) => a.from - b.from) } : null,
    weekendDays: keys.filter((k) => weekday(keyTime(k)) >= 5).length,
    early, late, finished,
    gap: longestGap(keys),
  };
}

/** The longest run of days with a cycle; the first one wins a tie. */
export function longestRun(days: Map<DayKey, DayTotal>, from: number, to: number): Run | null {
  let best: Run | null = null, n = 0, first = 0;
  for (let t = from; t <= to; t = addDays(t, 1)) {
    if (!days.get(dayKey(t))?.cycles) { n = 0; continue; }
    if (!n++) first = t;
    if (!best || n > best.days) best = { days: n, from: first, to: t };
  }
  return best;
}

function longestGap(keys: DayKey[]): YearStats["gap"] {
  let gap: YearStats["gap"] = null;
  for (let i = 1; i < keys.length; i++) {
    const back = keyTime(keys[i]), days = Math.round((back - keyTime(keys[i - 1])) / 864e5) - 1;
    if (days > 0 && (!gap || days > gap.days)) gap = { days, back };
  }
  return gap;
}

/** How many months of the year have passed, counting the current one. */
export const monthsSoFar = (y: YearStats) => (y.partial ? new Date(y.end).getMonth() + 1 : 12);

export type BadgeId = "century" | "early" | "owl" | "marathon" | "week" | "month" | "weekend" | "loyal" | "comeback" | "finisher" | "goal" | "allYear";

export interface Badge {
  id: BadgeId;
  name: string;
  how: string;
  earned: boolean;
  have: number;
  need: number;
  /** The label behind Label loyalist. */
  note?: string;
}

export const BADGE_IDS: BadgeId[] = ["century", "week", "marathon", "early", "owl", "weekend", "loyal", "goal", "comeback", "allYear", "month", "finisher"];

/** The year's achievements in a fixed order, earned or not. */
export function badges(y: YearStats, goal = 8): Badge[] {
  const most = (m: Map<DayKey, DayTotal>) => Math.max(0, ...[...m.values()].map((d) => d.cycles));
  const loyal = y.labels.reduce<YearLabel | null>((b, l) => (!b || l.cycles > b.cycles ? l : b), null);
  const months = monthsSoFar(y);
  const def: Record<BadgeId, [name: string, how: string, have: number, need: number]> = {
    century: ["Century", "Finish 100 cycles in a year", y.cycles, 100],
    week: ["Week streak", "Focus 7 days in a row", y.streak?.days || 0, 7],
    marathon: ["Marathon day", "Finish 10 cycles in one day", most(y.days), 10],
    early: ["Early bird", "Start 10 cycles before 8 am", y.early, 10],
    owl: ["Night owl", "Start 10 cycles after 9 pm", y.late, 10],
    weekend: ["Weekend warrior", "Focus on 10 weekend days", y.weekendDays, 10],
    loyal: ["Label loyalist", "Finish 50 cycles under one label", loyal?.cycles || 0, 50],
    goal: ["Goal getter", "Reach your daily goal on 10 days", [...y.days.values()].filter((d) => goal > 0 && d.cycles >= goal).length, 10],
    comeback: ["Comeback", "Return after two weeks away", Math.min(14, y.gap?.days || 0), 14],
    allYear: ["All year round", "Focus in every month", y.months.slice(0, months).filter(Boolean).length, months < 3 ? 3 : months],
    month: ["Month streak", "Focus 30 days in a row", y.streak?.days || 0, 30],
    finisher: ["Finisher", "Finish 25 tasks", y.finished, 25],
  };
  return BADGE_IDS.map((id) => {
    const [name, how, have, need] = def[id];
    return { id, name, how, have: Math.min(have, need), need, earned: have >= need, ...(id === "loyal" && have >= need ? { note: loyal!.name } : {}) };
  });
}

/** The year to offer on this visit: the current one, once, in December, if it had focus. */
export function yearDue(tasks: Tasks, now: number, seen: number | undefined): number | null {
  const d = new Date(now), y = d.getFullYear();
  if (d.getMonth() !== 11 || seen === y) return null;
  return focusYears(tasks).includes(y) ? y : null;
}
