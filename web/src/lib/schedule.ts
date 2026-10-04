/** When a recurring public session runs: weekdays (0 is Sunday) and a window in minutes after midnight, in its creator's zone. */
export interface Times { tz: string; days: number[]; from: number; to: number }

export interface Schedule extends Times { id: string; title: string; rhythm: "25/5" | "50/10"; max: number }

/** A schedule as the lobby lists it, with its next session. */
export interface Upcoming extends Schedule { start: number; end: number; going: number }

export interface Session { start: number; end: number }

export const STEP = 30;
export const LONGEST = 8 * 60;

const DAY = 86400000;
const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const formats = new Map<string, Intl.DateTimeFormat>();

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function wall(t: number, tz: string) {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formats.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(t)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second };
}

/** How far `tz` is ahead of UTC at `t`, in ms. */
export function offsetAt(t: number, tz: string) {
  const w = wall(t, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(t / 1000) * 1000;
}

/** The instant a wall-clock time happens in `tz`. A time skipped by DST lands an hour later. */
export function zoned(y: number, m: number, d: number, mins: number, tz: string) {
  const local = Date.UTC(y, m - 1, d, 0, mins), first = offsetAt(local, tz), t = local - first, second = offsetAt(t, tz);
  return second === first ? t : local - second;
}

export function isZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Valid times from untrusted input, or null. */
export function readTimes(v: { tz?: unknown; days?: unknown; from?: unknown; to?: unknown }): Times | null {
  if (!Array.isArray(v.days) || !v.days.length || v.days.length > 7 || !isZone(v.tz)) return null;
  if (!v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const from = v.from, to = v.to;
  if (typeof from !== "number" || typeof to !== "number" || from % STEP || to % STEP) return null;
  if (from < 0 || to > 1440 || to <= from || to - from > LONGEST) return null;
  return { tz: v.tz, days: [...new Set(v.days as number[])].sort(), from, to };
}

/** The session running at `now`, or else the next one. */
export function nextSession(s: Times, now: number): Session | null {
  const w = wall(now, s.tz);
  for (let i = 0; i < 8; i++) {
    const date = new Date(Date.UTC(w.y, w.m - 1, w.d + i));
    if (!s.days.includes(date.getUTCDay())) continue;
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate(), end = zoned(y, m, d, s.to, s.tz);
    if (end > now) return { start: zoned(y, m, d, s.from, s.tz), end };
  }
  return null;
}

export const isLive = (o: Session | null, now: number) => !!o && o.start <= now && now < o.end;

/** The room code for one session: L, the schedule id, and two letters for its day. Random codes never contain an L. */
export function sessionCode(id: string, start: number) {
  const n = Math.floor(start / DAY) % (CODE.length * CODE.length);
  return "L" + id + CODE[Math.floor(n / CODE.length)] + CODE[n % CODE.length];
}

/** The schedule id in a session's room code, or null. */
export function scheduleOf(code: string) {
  return /^L[A-HJKMNP-Z2-9]{5}$/.test(code) ? code.slice(1, 4) : null;
}

export function clockIn(t: number, tz = localZone()) {
  const w = wall(t, tz);
  return pad2(w.h) + ":" + pad2(w.min);
}

/** "Today", "Tomorrow" or a weekday, as seen in `tz`. */
export function dayIn(t: number, now: number, tz = localZone()) {
  const a = wall(t, tz), b = wall(now, tz), at = Date.UTC(a.y, a.m - 1, a.d);
  const n = Math.round((at - Date.UTC(b.y, b.m - 1, b.d)) / DAY);
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : SHORT[new Date(at).getUTCDay()];
}

/** The weekdays a schedule's sessions start on, as seen in `tz`. */
export function daysIn(s: Times, now: number, tz = localZone()) {
  const out = new Set<number>();
  let o = nextSession(s, now);
  while (o && o.start < now + 7 * DAY) {
    const w = wall(o.start, tz);
    out.add(new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay());
    o = nextSession(s, o.end);
  }
  return [...out].sort();
}

export function daysText(days: number[]) {
  const set = new Set(days), has = (list: number[]) => list.length === set.size && list.every((d) => set.has(d));
  if (set.size === 7) return "Every day";
  if (has([1, 2, 3, 4, 5])) return "Weekdays";
  if (has([0, 6])) return "Weekends";
  const list = [...set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => SHORT[d]);
  return list.length === 1 ? "Every " + list[0] : list.join(", ");
}

export const placeOf = (tz: string) => (tz.split("/").pop() || tz).replace(/_/g, " ");
