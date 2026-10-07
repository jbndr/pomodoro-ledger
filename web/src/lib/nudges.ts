export type NudgeWhen = "breaks" | "focus" | "times";
export type NudgeEvery = "1" | "2" | "3" | "long";

export interface Nudge {
  id: string; text: string; on: boolean; preset?: boolean;
  /** Before schedules this was "break", "long" or "hour". */
  every?: string;
  when?: NudgeWhen; minutes?: number; times?: string[]; days?: number[]; between?: boolean; from?: string; to?: string;
}

export interface Schedule { when: NudgeWhen; every: NudgeEvery; minutes: number; times: string[]; days: number[]; between: boolean; from: string; to: string }

/** How much focus and how many breaks there have been since a moment. */
export interface NudgeContext { focusSince(at: number): number; breaksSince(at: number): number }

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [0, 1, 2, 3, 4];
export const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const MAX_TIMES = 4;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PRESET_NUDGES: Nudge[] = [
  { id: "eyes", text: "Rest your eyes: look 20 feet away", on: true, preset: true, when: "breaks", every: "1" },
  { id: "stretch", text: "Stand up and stretch", on: true, preset: true, when: "breaks", every: "long" },
  { id: "water", text: "Drink a glass of water", on: false, preset: true, when: "focus", every: "1", minutes: 60 },
];

export const NUDGE_IDEAS: Nudge[] = [
  { id: "breathe", text: "Breathe slowly for a minute", on: true, when: "breaks", every: "1" },
  { id: "posture", text: "Fix your posture", on: true, when: "breaks", every: "2" },
  { id: "walk", text: "Walk around for two minutes", on: true, when: "breaks", every: "long" },
  { id: "window", text: "Look out of a window", on: true, when: "breaks", every: "3" },
  { id: "refill", text: "Refill your water bottle", on: true, when: "focus", minutes: 120 },
  { id: "desk", text: "Tidy your desk", on: true, when: "times", times: ["17:30"], days: WEEKDAYS },
];

/** The saved list, or the presets for anyone who hasn't changed it; an empty list means none. */
export const nudgesOf = (list?: Nudge[]) => (Array.isArray(list) ? list : PRESET_NUDGES);

/** A nudge's schedule with every gap filled, reading the single rhythm from before schedules. */
export function scheduleOf(n: Nudge): Schedule {
  const when: NudgeWhen = n.when === "focus" || n.when === "times" || n.when === "breaks" ? n.when : n.every === "hour" ? "focus" : "breaks";
  const every: NudgeEvery = n.every === "2" || n.every === "3" || n.every === "long" ? n.every : "1";
  const minutes = Math.max(15, Math.min(240, Math.round((n.minutes ?? 60) / 15) * 15 || 60));
  const times = [...new Set((n.times || []).filter((t) => HHMM.test(t)))].sort().slice(0, MAX_TIMES);
  const days = Array.isArray(n.days) ? [...new Set(n.days.filter((d) => Number.isInteger(d) && d >= 0 && d < 7))].sort() : ALL_DAYS;
  return {
    when, every, minutes, times: times.length ? times : ["11:00"], days, between: !!n.between,
    from: HHMM.test(n.from || "") ? n.from! : "08:00", to: HHMM.test(n.to || "") ? n.to! : "19:00",
  };
}

/** A nudge as stored, with its schedule written out. */
export const withSchedule = (n: Nudge, s: Schedule): Nudge => ({ id: n.id, text: n.text, on: n.on, ...(n.preset ? { preset: true } : {}), ...s });

const minutesOf = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3);
const clockOf = (d: Date) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
const inHours = (hm: string, from: string, to: string) => (from <= to ? hm >= from && hm < to : hm >= from || hm < to);

/** Whether a nudge belongs in a break starting now. Counts start afresh each day. */
export function isDue(n: Nudge, seen: number, kind: "short" | "long", now: number, ctx: NudgeContext): boolean {
  if (!n.on || !n.text.trim()) return false;
  const s = scheduleOf(n), d = new Date(now), dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (!s.days.includes((d.getDay() + 6) % 7)) return false;
  if (s.between && !inHours(clockOf(d), s.from, s.to)) return false;
  const since = Math.max(seen, dayStart);
  if (s.when === "breaks") return s.every === "long" ? kind === "long" : s.every === "1" || ctx.breaksSince(since) >= +s.every;
  if (s.when === "focus") return ctx.focusSince(since) >= s.minutes * 60_000;
  return s.times.some((t) => { const at = dayStart + minutesOf(t) * 60_000; return at <= now && seen < at; });
}

const ANY: NudgeContext = { focusSince: () => Infinity, breaksSince: () => Infinity };

/** The nudge for a break: of those due, the one shown longest ago. */
export function pickNudge(list: Nudge[], seen: Record<string, number>, kind: "short" | "long", now: number, ctx: NudgeContext = ANY): Nudge | null {
  const due = list.filter((n) => isDue(n, seen[n.id] || 0, kind, now, ctx));
  return due.sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0))[0] || null;
}

/** Done counts per day, keeping the last 60 days. */
export function logNudge(log: Record<string, number>, day: string): Record<string, number> {
  const next = { ...log, [day]: (log[day] || 0) + 1 };
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 60));
}

/* Schedules in plain words */
const ORD: Record<NudgeEvery, string> = { "1": "every break", "2": "every 2nd break", "3": "every 3rd break", long: "long breaks" };
export const durText = (m: number) => (m < 60 ? m + " min" : m % 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m / 60 + " h");
const sameDays = (a: number[], b: number[]) => a.join() === b.join();
export const daysText = (d: number[]) => (d.length === 7 ? "Every day" : sameDays(d, WEEKDAYS) ? "Weekdays" : sameDays(d, [5, 6]) ? "Weekends" : !d.length ? "No days" : d.map((i) => DAY_NAMES[i]).join(" "));
export const whenText = (s: Schedule) => (s.when === "breaks" ? (s.every === "long" ? "Long breaks" : ORD[s.every][0].toUpperCase() + ORD[s.every].slice(1)) : s.when === "focus" ? "After " + durText(s.minutes) + " of focus" : "After " + s.times.join(", "));
export const scheduleLine = (s: Schedule) => [whenText(s), daysText(s.days), s.between ? s.from + "–" + s.to : ""].filter(Boolean).join(" · ");
export const whenPhrase = (s: Schedule) => (s.when === "breaks" ? "in " + ORD[s.every] : s.when === "focus" ? "after " + durText(s.minutes) + " of focus" : "after " + s.times.join(" and "));
export const daysPhrase = (s: Schedule) => (s.days.length === 7 ? "every day" : !s.days.length ? "on no days" : sameDays(s.days, WEEKDAYS) ? "on weekdays" : sameDays(s.days, [5, 6]) ? "on weekends" : "on " + s.days.map((i) => DAY_NAMES[i]).join(", "));
export const hoursPhrase = (s: Schedule) => (s.between ? "between " + s.from + "–" + s.to : "at any time");

/** A nudge typed in plain words, like "Drink water every 90 min on weekdays"; found is false when nothing said when. */
export function parseNudge(raw: string): { text: string; schedule: Schedule; found: boolean } {
  let rest = " " + raw + " ", found = false;
  const s = scheduleOf({ id: "", text: "", on: true });
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { const m = rest.match(re); if (m) { fn(m); rest = rest.replace(m[0], " "); found = true; } };
  const clock = (h: string, m?: string, ap?: string) => {
    let hr = +h; const p = (ap || "").toLowerCase();
    if (p === "pm" && hr < 12) hr += 12;
    if (p === "am" && hr === 12) hr = 0;
    return String(Math.min(hr, 23)).padStart(2, "0") + ":" + (m || "00");
  };
  take(/\b(?:between|from) (\d{1,2})(?::(\d{2}))? ?(am|pm)? ?(?:and|to|-|–) ?(\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/i, (m) => { s.between = true; s.from = clock(m[1], m[2], m[3]); s.to = clock(m[4], m[5], m[6]); });
  take(/\b(?:in |during )?(?:every|each) (2nd|second|other|3rd|third) break\b/i, (m) => { s.when = "breaks"; s.every = /3|third/i.test(m[1]) ? "3" : "2"; });
  take(/\b(?:in |during |on )?(?:the |my )?long breaks?\b/i, () => { s.when = "breaks"; s.every = "long"; });
  take(/\b(?:in |during )?(?:every|each) break\b/i, () => { s.when = "breaks"; s.every = "1"; });
  take(/\b(?:every|each) ?day\b|\bdaily\b/i, () => { s.days = ALL_DAYS; });
  take(/\b(?:every|after) (\d+(?:[.,]\d+)?) ?(h|hrs?|hours?|m|mins?|minutes?)\b(?: of focus)?/i, (m) => {
    const v = parseFloat(m[1].replace(",", "."));
    s.when = "focus"; s.minutes = Math.max(15, Math.min(240, Math.round((/^h/i.test(m[2]) ? v * 60 : v) / 15) * 15));
  });
  take(/\b(?:every|each) hour\b|\bhourly\b/i, () => { s.when = "focus"; s.minutes = 60; });
  take(/\bat (\d{1,2}(?::\d{2})?(?: ?(?:am|pm))?(?:\s*(?:,|and|&)\s*\d{1,2}(?::\d{2})?(?: ?(?:am|pm))?)*)/i, (m) => {
    s.when = "times"; s.times = [...new Set([...m[1].matchAll(/(\d{1,2})(?::(\d{2}))? ?(am|pm)?/gi)].map((x) => clock(x[1], x[2], x[3])))].sort().slice(0, MAX_TIMES);
  });
  take(/\b(?:on )?weekdays\b/i, () => { s.days = WEEKDAYS; });
  take(/\b(?:on )?weekends?\b/i, () => { s.days = [5, 6]; });
  const text = rest.replace(/\s+/g, " ").replace(/^[\s,;·–-]+|[\s,;·–-]+$/g, "").trim();
  return { text: text.charAt(0).toUpperCase() + text.slice(1), schedule: s, found };
}
