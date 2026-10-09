import { addDays, dayKey, keyTime, type DayKey } from "./dates";
import type { Task } from "./tasks";

/** How a task repeats: every day, on weekdays, on chosen weekdays (0 is Sunday), or on a day of the month, every `n`th time counted from `from`. */
export interface Repeat {
  every: "day" | "weekday" | "week" | "month";
  days?: number[];
  date?: number;
  n?: number;
  from?: DayKey;
}

/** The longest interval for each kind. */
export const MAX_N = { day: 99, week: 52, month: 24 } as const;

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAMES = [
  ["sunday", "sun", "sonntag"], ["monday", "mon", "montag"], ["tuesday", "tue", "tues", "dienstag"], ["wednesday", "wed", "mittwoch"],
  ["thursday", "thu", "thur", "thurs", "donnerstag"], ["friday", "fri", "freitag"], ["saturday", "sat", "samstag"],
];
// Any Monday: the start for intervals saved without one.
const EPOCH = "2000-01-03";
const SPAN = 800;

const shift = (k: DayKey, n: number) => dayKey(addDays(keyTime(k), n));
const monFirst = (a: number, b: number) => ((a + 6) % 7) - ((b + 6) % 7);
const isKey = (k: unknown): k is DayKey => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && dayKey(keyTime(k)) === k;

/** A valid rule from stored or synced data, or null. */
export function cleanRepeat(r: unknown): Repeat | null {
  if (!r || typeof r !== "object") return null;
  const { every, days, date, n, from } = r as Repeat;
  let out: Repeat | null = null;
  if (every === "day" || every === "weekday") out = { every };
  else if (every === "week") {
    const d = [...new Set(Array.isArray(days) ? days : [])].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort(monFirst);
    if (d.length) out = { every, days: d };
  } else if (every === "month" && Number.isInteger(date) && date! >= 1 && date! <= 31) out = { every, date };
  if (out && out.every !== "weekday" && Number.isInteger(n) && n! >= 2 && n! <= MAX_N[out.every]) {
    out.n = n;
    if (isKey(from)) out.from = from;
  }
  return out;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const ymd = (k: DayKey) => k.split("-").map(Number);
const dayNo = (k: DayKey) => { const [y, m, d] = ymd(k); return Date.UTC(y, m - 1, d) / 864e5; };
// Weeks run Monday to Sunday; 5 January 1970 was a Monday.
const weekNo = (k: DayKey) => Math.floor((dayNo(k) - 4) / 7);
const monthNo = (k: DayKey) => { const [y, m] = ymd(k); return y * 12 + m - 1; };

function onCycle(r: Repeat, k: DayKey): boolean {
  const n = r.n || 1;
  if (n < 2) return true;
  const unit = r.every === "day" ? dayNo : r.every === "week" ? weekNo : monthNo;
  return mod(unit(k) - unit(r.from || EPOCH), n) === 0;
}

export function isDue(r: Repeat, k: DayKey): boolean {
  const d = new Date(keyTime(k)), wd = d.getDay();
  if (r.every === "weekday") return wd > 0 && wd < 6;
  if (!onCycle(r, k)) return false;
  if (r.every === "day") return true;
  if (r.every === "week") return (r.days || []).includes(wd);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(r.date || 1, last);
}

/** The first due day after `k`. */
export function nextDue(r: Repeat, k: DayKey): DayKey {
  for (let i = 1; i <= SPAN; i++) if (isDue(r, shift(k, i))) return shift(k, i);
  return shift(k, 1);
}

/** The first due day on or after `k`. */
export const firstDue = (r: Repeat, k: DayKey): DayKey => nextDue(r, shift(k, -1));

/** The last due day on or before `k`. */
export function lastDue(r: Repeat, k: DayKey): DayKey {
  for (let i = 0; i <= SPAN; i++) if (isDue(r, shift(k, -i))) return shift(k, -i);
  return k;
}

/** An interval rule counted from its first due day on or after `k`, unless it already has a start. */
export function anchored(r: Repeat, k: DayKey): Repeat {
  if ((r.n || 1) < 2 || r.from) return r;
  return { ...r, from: firstDue({ ...r, n: 1 }, k) };
}

export const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

const dayList = (r: Repeat) => (r.days || []).map((d) => SHORT[d]).join(", ");
const everyN = (n: number, unit: string) => (n === 2 && unit === "day" ? "Every other day" : "Every " + n + " " + unit + "s");

export function repeatText(r: Repeat): string {
  const n = r.n || 1;
  if (r.every === "weekday") return "Every weekday";
  if (r.every === "day") return n > 1 ? everyN(n, "day") : "Every day";
  if (r.every === "week") return n > 1 ? everyN(n, "week") + " · " + dayList(r) : "Every " + dayList(r);
  return (n > 1 ? everyN(n, "month") : "Every month") + " on the " + ordinal(r.date || 1);
}

/** A few characters for the task row. */
export function repeatShort(r: Repeat): string {
  const n = r.n || 1;
  if (n > 1 && r.every === "week") return "Every " + n + " wks · " + dayList(r);
  if (n > 1 && r.every !== "weekday") return everyN(n, r.every);
  if (r.every === "day") return "Daily";
  if (r.every === "weekday") return "Weekdays";
  if (r.every === "week" && r.days?.length === 1) { const name = NAMES[r.days[0]][0]; return name[0].toUpperCase() + name.slice(1) + "s"; }
  if (r.every === "week") return dayList(r);
  return "Monthly";
}

const dayOf = (w: string) => NAMES.findIndex((names) => names.includes(w) || (w.endsWith("s") && (names[0] === w.slice(0, -1) || names.at(-1) === w.slice(0, -1))));

function weekdays(s: string): number[] | undefined {
  if (/^(weekend|wochenende)$/.test(s)) return [6, 0];
  const days = s.split(/ ?, ?| and | und | ?& ?| /).filter(Boolean).map(dayOf);
  return days.length && !days.includes(-1) ? days : undefined;
}

const COUNT: Record<string, number> = {
  other: 2, second: 2, third: 3, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
  zweite: 2, zweiten: 2, dritte: 3, dritten: 3, vierte: 4, vierten: 4,
};
const ALTERNATE = ["other", "zweite", "zweiten"];
const UNIT: Record<string, "day" | "week" | "month"> = {
  day: "day", days: "day", tag: "day", tage: "day", week: "week", weeks: "week", woche: "week", wochen: "week", month: "month", months: "month", monat: "month", monate: "month",
};

/** Reads "every 2 weeks on mon", "every other day", "every 3 months on the 15th", "alle 2 Wochen"; null when it isn't an interval. */
function parseInterval(q: string, today: Date): Repeat | undefined | null {
  q = q.replace(/^(biweekly|fortnightly|every fortnight|zweiwöchentlich|zweiwoechentlich)(?= |$)/, "every 2 weeks");
  const m = q.match(/^(?:every|each|alle|jeden|jede) (\S+) (\S+)(?: (.+))?$/);
  if (!m) return null;
  const digits = m[1].match(/^(\d{1,2})(st|nd|rd|th|\.)?$/), n = digits ? +digits[1] : COUNT[m[1]], unit = UNIT[m[2]];
  if (!n) return null;
  if (!unit) {
    const days = ALTERNATE.includes(m[1]) ? weekdays(m[3] ? m[2] + " " + m[3] : m[2]) : undefined;
    return days ? cleanRepeat({ every: "week", days, n }) || undefined : undefined;
  }
  if (n > MAX_N[unit]) return undefined;
  const rest = (m[3] || "").replace(/^(on|am|,) /, "");
  if (unit === "day") return rest ? undefined : cleanRepeat({ every: "day", n }) || undefined;
  if (unit === "week") {
    const days = rest ? weekdays(rest) : [today.getDay()];
    return days ? cleanRepeat({ every: "week", days, n }) || undefined : undefined;
  }
  const date = rest ? rest.match(/^(?:the |den )?(\d{1,2})(?:st|nd|rd|th|\.)$/) : null;
  if (rest && !date) return undefined;
  return cleanRepeat({ every: "month", date: date ? +date[1] : today.getDate(), n }) || undefined;
}

/** Reads "every day", "every weekday", "every mon wed", "every month", "every 15th", intervals like "every 2 weeks" and a few German forms. */
export function parseRepeat(raw: string, now = Date.now()): Repeat | undefined {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " "), today = new Date(now);
  const interval = parseInterval(q, today);
  if (interval !== null) return interval && anchored(interval, dayKey(now));
  if (/^(every ?day|each day|daily|täglich|taeglich|jeden tag)$/.test(q)) return { every: "day" };
  if (/^(every (week|work) ?day|on weekdays|werktags|jeden werktag)$/.test(q)) return { every: "weekday" };
  if (/^(every week|weekly|wöchentlich|woechentlich|jede woche)$/.test(q)) return { every: "week", days: [today.getDay()] };
  if (/^(every month|monthly|monatlich|jeden monat)$/.test(q)) return { every: "month", date: today.getDate() };
  let m = q.match(/^(?:every|each|every month on|monthly on|jeden) (?:the )?(\d{1,2})(?:st|nd|rd|th|\.)$/);
  if (m) return +m[1] >= 1 && +m[1] <= 31 ? { every: "month", date: +m[1] } : undefined;
  m = q.match(/^(?:every|each|on|jeden|jede) (.+)$/);
  if (!m) return undefined;
  const days = weekdays(m[1]);
  return days ? cleanRepeat({ every: "week", days }) || undefined : undefined;
}

export const seriesOf = (t: Task) => t.series || t.id;

/** On hold: until a day still ahead, or until resumed. */
export const isPaused = (t: Task, tk: DayKey) => !!cleanRepeat(t.repeat) && !!t.paused && (!t.paused.until || t.paused.until > tk);

/** A recurring task put on hold. With a day it waits on its first due day from then; without one it leaves the plan until resumed. */
export function paused(t: Task, until: DayKey | null): Task {
  const r = cleanRepeat(t.repeat);
  if (!r) return t;
  const n: Task = { ...t, today: false, paused: until ? { until } : {} };
  if (until) n.plan = firstDue(r, until);
  else delete n.plan;
  return n;
}

/** Back on its rule from today. */
export function resumed(t: Task, tk: DayKey): Task {
  const n: Task = { ...t };
  delete n.paused;
  const r = cleanRepeat(t.repeat);
  if (!r) return n;
  n.plan = firstDue(r, tk);
  n.today = n.plan === tk;
  return n;
}

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
  delete n.paused;
  if (!r) { delete n.repeat; return n; }
  const start = t.plan && t.plan > tk ? t.plan : tk;
  n.repeat = r = anchored(r, start);
  const plan = firstDue(r, start);
  n.today = plan === tk;
  n.plan = plan;
  return n;
}
