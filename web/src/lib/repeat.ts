import { addDays, dayKey, keyTime, type DayKey } from "./dates";
import type { Task } from "./tasks";

/** How a task repeats: every day, on weekdays, on chosen weekdays (0 is Sunday), or on a day of the month. */
export interface Repeat {
  every: "day" | "weekday" | "week" | "month";
  days?: number[];
  date?: number;
}

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAMES = [
  ["sunday", "sun", "sonntag"], ["monday", "mon", "montag"], ["tuesday", "tue", "tues", "dienstag"], ["wednesday", "wed", "mittwoch"],
  ["thursday", "thu", "thur", "thurs", "donnerstag"], ["friday", "fri", "freitag"], ["saturday", "sat", "samstag"],
];

const shift = (k: DayKey, n: number) => dayKey(addDays(keyTime(k), n));
const monFirst = (a: number, b: number) => ((a + 6) % 7) - ((b + 6) % 7);

/** A valid rule from stored or synced data, or null. */
export function cleanRepeat(r: unknown): Repeat | null {
  if (!r || typeof r !== "object") return null;
  const { every, days, date } = r as Repeat;
  if (every === "day" || every === "weekday") return { every };
  if (every === "week") {
    const d = [...new Set(Array.isArray(days) ? days : [])].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort(monFirst);
    return d.length ? { every, days: d } : null;
  }
  if (every === "month" && Number.isInteger(date) && date! >= 1 && date! <= 31) return { every, date };
  return null;
}

export function isDue(r: Repeat, k: DayKey): boolean {
  const d = new Date(keyTime(k)), wd = d.getDay();
  if (r.every === "day") return true;
  if (r.every === "weekday") return wd > 0 && wd < 6;
  if (r.every === "week") return (r.days || []).includes(wd);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(r.date || 1, last);
}

/** The first due day after `k`. */
export function nextDue(r: Repeat, k: DayKey): DayKey {
  for (let i = 1; i <= 400; i++) if (isDue(r, shift(k, i))) return shift(k, i);
  return shift(k, 1);
}

/** The first due day on or after `k`. */
export const firstDue = (r: Repeat, k: DayKey): DayKey => nextDue(r, shift(k, -1));

/** The last due day on or before `k`. */
export function lastDue(r: Repeat, k: DayKey): DayKey {
  for (let i = 0; i <= 400; i++) if (isDue(r, shift(k, -i))) return shift(k, -i);
  return k;
}

export const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

export function repeatText(r: Repeat): string {
  if (r.every === "day") return "Every day";
  if (r.every === "weekday") return "Every weekday";
  if (r.every === "week") return "Every " + (r.days || []).map((d) => SHORT[d]).join(", ");
  return "Every month on the " + ordinal(r.date || 1);
}

/** A few characters for the task row. */
export function repeatShort(r: Repeat): string {
  if (r.every === "day") return "Daily";
  if (r.every === "weekday") return "Weekdays";
  if (r.every === "week" && r.days?.length === 1) { const name = NAMES[r.days[0]][0]; return name[0].toUpperCase() + name.slice(1) + "s"; }
  if (r.every === "week") return (r.days || []).map((d) => SHORT[d]).join(", ");
  return "Monthly";
}

const dayOf = (w: string) => NAMES.findIndex((names) => names.includes(w) || (w.endsWith("s") && names[0] === w.slice(0, -1)));

/** Reads "every day", "every weekday", "every mon wed", "every month", "every 15th" and a few German forms. */
export function parseRepeat(raw: string, now = Date.now()): Repeat | undefined {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " "), today = new Date(now);
  if (/^(every ?day|each day|daily|täglich|taeglich|jeden tag)$/.test(q)) return { every: "day" };
  if (/^(every (week|work) ?day|on weekdays|werktags|jeden werktag)$/.test(q)) return { every: "weekday" };
  if (/^(every week|weekly|wöchentlich|woechentlich|jede woche)$/.test(q)) return { every: "week", days: [today.getDay()] };
  if (/^(every month|monthly|monatlich|jeden monat)$/.test(q)) return { every: "month", date: today.getDate() };
  let m = q.match(/^(?:every|each|every month on|monthly on|jeden) (?:the )?(\d{1,2})(?:st|nd|rd|th|\.)$/);
  if (m) return +m[1] >= 1 && +m[1] <= 31 ? { every: "month", date: +m[1] } : undefined;
  m = q.match(/^(?:every|each|on|jeden|jede) (.+)$/);
  if (!m) return undefined;
  if (/^(weekend|wochenende)$/.test(m[1])) return { every: "week", days: [6, 0] };
  const days = m[1].split(/ ?, ?| and | und | ?& ?| /).filter(Boolean).map(dayOf);
  if (!days.length || days.includes(-1)) return undefined;
  return cleanRepeat({ every: "week", days }) || undefined;
}

export const seriesOf = (t: Task) => t.series || t.id;

/** The next occurrence of a finished recurring task, on its next due day after today or after its own day. */
export function nextOccurrence(t: Task, tk: DayKey, now = Date.now()): Task | null {
  const r = cleanRepeat(t.repeat);
  if (!r) return null;
  const plan = nextDue(r, t.plan && t.plan > tk ? t.plan : tk), series = seriesOf(t);
  const n: Task = {
    id: series + "-" + plan.replace(/-/g, ""), title: t.title, est: t.est, done: false, doneAt: null, createdAt: now, plan, repeat: r, series,
    sessions: [], subtasks: (t.subtasks || []).map((s) => ({ ...s, done: false })),
  };
  if (t.project) n.project = t.project;
  if (t.notes) n.notes = t.notes;
  if (t.section) n.section = t.section;
  return n;
}

const logged = (t: Task) => (t.sessions || []).length > 0;

/**
 * Keeps one open occurrence per series and moves an unfinished one forward to its latest due day,
 * so a missed daily task becomes today's instead of piling up. Extra occurrences without sessions are dropped.
 */
export function catchUp(tasks: Iterable<Task>, tk: DayKey): { save: Task[]; drop: string[] } {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) if (!t.done && !t.system && cleanRepeat(t.repeat)) groups.set(seriesOf(t), [...(groups.get(seriesOf(t)) || []), t]);
  const save: Task[] = [], drop: string[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (b.plan || tk).localeCompare(a.plan || tk));
    const [keep, ...rest] = list;
    drop.push(...rest.filter((t) => !logged(t)).map((t) => t.id));
    if (!keep.plan || keep.plan >= tk) continue;
    const due = lastDue(cleanRepeat(keep.repeat)!, tk);
    if (due > keep.plan) save.push({ ...keep, plan: due });
  }
  return { save, drop };
}

/** A task with its repeat set or cleared, planned for the rule's first due day from today or its own later day. */
export function withRepeat(t: Task, r: Repeat | null, tk: DayKey): Task {
  const n: Task = { ...t };
  if (!r) { delete n.repeat; return n; }
  n.repeat = r;
  const plan = firstDue(r, t.plan && t.plan > tk ? t.plan : tk);
  n.today = plan === tk;
  n.plan = plan;
  return n;
}
