import { addDays, dayKey, keyTime, MIN, sod, type DayKey } from "./dates";
import { runStart } from "./day";
import { weekStart } from "./insights";
import { matchesLabel, sessionProject, type LabelFilter, type Session, type Tasks } from "./tasks";

export type RangeKind = "week" | "lastWeek" | "month" | "lastMonth" | "custom";
export type Grouping = "task" | "day";

/** Local days, both included. */
export interface Range { from: DayKey; to: DayKey }

export const RANGES: [RangeKind, string][] = [["week", "This week"], ["lastWeek", "Last week"], ["month", "This month"], ["lastMonth", "Last month"], ["custom", "Custom"]];

const monthOf = (now: number, back: number): Range => {
  const d = new Date(now), first = new Date(d.getFullYear(), d.getMonth() - back, 1).getTime();
  return { from: dayKey(first), to: dayKey(new Date(d.getFullYear(), d.getMonth() - back + 1, 0).getTime()) };
};

/** The days a range choice covers; a custom range is put in order. */
export function rangeOf(kind: RangeKind, now: number, custom?: Partial<Range>): Range {
  if (kind === "week" || kind === "lastWeek") {
    const start = addDays(weekStart(now), kind === "week" ? 0 : -7);
    return { from: dayKey(start), to: dayKey(addDays(start, 6)) };
  }
  if (kind === "month" || kind === "lastMonth") return monthOf(now, kind === "month" ? 0 : 1);
  const today = dayKey(sod(now)), from = validDay(custom?.from) || today, to = validDay(custom?.to) || today;
  return from <= to ? { from, to } : { from: to, to: from };
}

const validDay = (k: unknown): DayKey | null => (typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k) && dayKey(keyTime(k)) === k ? k : null);

type Logged = Session & { hand?: boolean; cycles?: number };

/** Whole cycles a session counts for. */
export const sessionCycles = (s: Session): number => {
  const n = (s as Logged).cycles;
  return s.full ? (typeof n === "number" && n > 1 ? Math.floor(n) : 1) : 0;
};

/** When a session started; times added by hand are taken as typed. */
export const sessionStart = (s: Session): number => ((s as Logged).hand ? s.at - (s.ms || 0) : runStart(s.run, s.at, s.ms || 0));

export interface SheetRow { key: string; title: string; label: string; ms: number; cycles: number }
export interface SheetGroup { key: string; label: string; day: DayKey; ms: number; cycles: number; rows: SheetRow[] }
export interface Sheet { groups: SheetGroup[]; ms: number; cycles: number }

const byTime = (a: { ms: number; title: string }, b: { ms: number; title: string }) => b.ms - a.ms || a.title.localeCompare(b.title);

/** Focus in `range` for a label filter, grouped by label then task, or by day then task. A session belongs to the day it started. */
export function timesheet(tasks: Tasks, range: Range, filter: LabelFilter, by: Grouping): Sheet {
  const groups = new Map<string, SheetGroup>(), sheet: Sheet = { groups: [], ms: 0, cycles: 0 };
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const ms = s.ms || 0, label = sessionProject(t, s);
    if (ms <= 0 || !matchesLabel(label, filter)) continue;
    const day = dayKey(sessionStart(s));
    if (day < range.from || day > range.to) continue;
    const gk = by === "task" ? label : day, cycles = sessionCycles(s);
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = { key: gk, label: by === "task" ? label : "", day: by === "day" ? day : "", ms: 0, cycles: 0, rows: [] }));
    const rk = (t.system ? "" : t.id) + (by === "day" ? "|" + label : "");
    let r = g.rows.find((x) => x.key === rk);
    if (!r) g.rows.push((r = { key: rk, title: t.system ? "Unplanned focus" : t.title, label, ms: 0, cycles: 0 }));
    r.ms += ms; r.cycles += cycles;
    g.ms += ms; g.cycles += cycles;
    sheet.ms += ms; sheet.cycles += cycles;
  }
  for (const g of groups.values()) g.rows.sort(byTime);
  sheet.groups = [...groups.values()].sort(by === "day" ? (a, b) => a.day.localeCompare(b.day) : (a, b) => (!a.label ? 1 : 0) - (!b.label ? 1 : 0) || b.ms - a.ms || a.label.localeCompare(b.label));
  return sheet;
}

/** Whether numbers in this locale are written with a decimal comma. */
export const decimalComma = (locale?: string) => new Intl.NumberFormat(locale).format(1.5).includes(",");

const minutes = (ms: number) => Math.round(ms / MIN);
const hours = (ms: number, comma: boolean) => { const h = (minutes(ms) / 60).toFixed(2); return comma ? h.replace(".", ",") : h; };
// A cell starting like a formula would run as one in a spreadsheet.
const text = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

/** The sheet as rows with a header, as a spreadsheet should get them. */
export function sheetRows(sheet: Sheet, by: Grouping, comma: boolean): string[][] {
  const out = [by === "task" ? ["Label", "Task", "Hours", "Minutes", "Cycles"] : ["Date", "Label", "Task", "Hours", "Minutes", "Cycles"]];
  for (const g of sheet.groups) for (const r of g.rows) {
    const nums = [hours(r.ms, comma), String(minutes(r.ms)), String(r.cycles)], label = text(r.label || "No label"), title = text(r.title);
    out.push(by === "task" ? [label, title, ...nums] : [g.day, label, title, ...nums]);
  }
  return out;
}

/** Comma-separated values, or semicolons where the decimal mark is a comma. */
export function toCSV(rows: string[][], comma: boolean): string {
  const sep = comma ? ";" : ",";
  const cell = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return rows.map((r) => r.map(cell).join(sep)).join("\r\n") + "\r\n";
}

/** Tab-separated values for the clipboard; tabs and line breaks inside a cell become spaces. */
export const toTSV = (rows: string[][]): string => rows.map((r) => r.map((v) => v.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n") + "\n";

/** A file name like timesheet-writing-2026-10-01-2026-10-31.csv. */
export function sheetFileName(filter: LabelFilter, range: Range): string {
  const name = !filter ? "all" : filter === "none" ? "no-label" : filter.slice(8).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "label";
  return "timesheet-" + name + "-" + range.from + "-" + range.to + ".csv";
}
