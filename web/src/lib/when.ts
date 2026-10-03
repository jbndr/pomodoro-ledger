import { addDays, dayKey, nextMonday, sod, type DayKey } from "./dates";

/** Where a task goes: today, a future day, or no day at all. */
export type When = "today" | "later" | DayKey;

const WEEKDAYS = [["sunday", "sonntag"], ["monday", "montag"], ["tuesday", "dienstag"], ["wednesday", "mittwoch"], ["thursday", "donnerstag"], ["friday", "freitag"], ["saturday", "samstag"]];
const MONTHS = [["january", "januar", "jänner"], ["february", "februar"], ["march", "märz", "maerz"], ["april"], ["may", "mai"], ["june", "juni"], ["july", "juli"], ["august"], ["september"], ["october", "oktober"], ["november"], ["december", "dezember"]];

/**
 * Reads what people type into "When": today, tom, fri, next week, in 3 days, 12 oct, 12.10., plus common German words.
 * `strict` accepts whole words only, for reading dates out of a task title without misfiring on "Call Tom" or "Release 1.2".
 * Returns null for empty input and undefined when nothing matches.
 */
export function parseWhen(raw: string, strict = false, now = Date.now()): When | null | undefined {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(on|am|bis|until|by) /, "");
  if (!q) return null;
  const base = sod(now), at = (n: number) => dayKey(addDays(base, n));
  const word = (list: string[], min: number) => list.some((w) => (strict ? w === q : q.length >= min && w.startsWith(q)));
  if (word(["today", "heute"], 3)) return "today";
  if (word(["tomorrow", "tmrw", "morgen"], 3) || (!strict && q === "tm")) return at(1);
  if (word(["übermorgen", "uebermorgen", "day after tomorrow"], 4)) return at(2);
  if (word(strict ? ["someday", "irgendwann"] : ["later", "someday", "anytime", "irgendwann", "später", "spaeter", "no day", "kein tag"], 3)) return "later";
  if (word(["next week", "nächste woche", "naechste woche"], 6) || q === "nw") return nextMonday(now);
  if (word(["weekend", "wochenende"], 4)) return at((6 - new Date(base).getDay() + 7) % 7 || 7);
  let m = q.match(/^(?:in )?\+?(\d{1,3}) ?(d|days?|t|tag|tage|tagen|w|wk|weeks?|wochen?)?$/);
  if (m && (m[2] || q.startsWith("in ") || q.startsWith("+"))) return at(+m[1] * (/^w/.test(m[2] || "") ? 7 : 1));
  const wd = q.replace(/^(next|nächsten|naechsten|nächster|kommenden) /, "");
  const day = WEEKDAYS.findIndex((names) => names.some((w) => (strict ? w === wd || (wd.length === 3 && w.startsWith(wd) && /^[a-z]+$/.test(w)) : wd.length >= 2 && w.startsWith(wd))));
  if (day >= 0) return at((day - new Date(base).getDay() + 7) % 7 || 7);
  const month = (s: string) => {
    const name = s.replace(/\.$/, "");
    return MONTHS.findIndex((names) => names.some((w) => (strict ? w === name || (name.length === 3 && w.startsWith(name)) : name.length >= 3 && w.startsWith(name))));
  };
  const make = (y: number | null, mo: number, d: number): DayKey | undefined => {
    const date = new Date(y ?? new Date(base).getFullYear(), mo, d);
    if (date.getMonth() !== mo || date.getDate() !== d) return undefined;
    if (y == null && date.getTime() < base) date.setFullYear(date.getFullYear() + 1);
    return dayKey(date.getTime());
  };
  const year = (y?: string) => (y == null ? null : y.length === 2 ? 2000 + +y : +y);
  if ((m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return make(+m[1], +m[2] - 1, +m[3]);
  if ((m = q.match(strict ? /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/ : /^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/))) return make(year(m[3]), +m[2] - 1, +m[1]);
  if ((m = q.match(/^(\d{1,2})\.? ([a-zäöü]+\.?)(?: (\d{4}))?$/)) && month(m[2]) >= 0) return make(year(m[3]), month(m[2]), +m[1]);
  if ((m = q.match(/^([a-zäöü]+\.?) (\d{1,2})(?:,? (\d{4}))?$/)) && month(m[1]) >= 0) return make(year(m[3]), month(m[1]), +m[2]);
  return undefined;
}
