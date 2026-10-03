import { addDays, dayKey, keyTime, type DayKey } from "./dates";

export interface CalDay {
  key: DayKey;
  /** Local midnight. */
  t: number;
  date: number;
  /** Belongs to the month before or after. */
  out: boolean;
}

/** First day of the week for a locale (0 is Sunday), Monday when the browser can't tell. */
export function weekStartOf(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo;
    return w ? w.firstDay % 7 : 1;
  } catch {
    return 1;
  }
}

/** Midnight on the first of the month that contains `t`. */
export const monthOf = (t: number): number => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export const stepMonth = (month: number, n: number): number => {
  const d = new Date(month);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
};

const weekday = (t: number, weekStart: number) => (new Date(t).getDay() - weekStart + 7) % 7;

/** The six weeks shown for a month, starting on `weekStart`. */
export function monthGrid(month: number, weekStart: number): CalDay[] {
  const first = new Date(month), y = first.getFullYear(), m = first.getMonth(), offset = weekday(month, weekStart);
  return [...Array(42)].map((_, i) => {
    const d = new Date(y, m, 1 - offset + i);
    return { key: dayKey(d.getTime()), t: d.getTime(), date: d.getDate(), out: d.getMonth() !== m };
  });
}

/** The day a calendar key moves focus to, or null for keys the calendar ignores. */
export function calMove(focus: DayKey, key: string, weekStart: number): DayKey | null {
  const at = keyTime(focus), d = new Date(at);
  const move = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[key];
  if (move) return dayKey(addDays(at, move));
  if (key === "PageUp" || key === "PageDown") return dayKey(new Date(d.getFullYear(), d.getMonth() + (key === "PageUp" ? -1 : 1), Math.min(d.getDate(), 28)).getTime());
  if (key === "Home") return dayKey(addDays(at, -weekday(at, weekStart)));
  if (key === "End") return dayKey(addDays(at, 6 - weekday(at, weekStart)));
  return null;
}
