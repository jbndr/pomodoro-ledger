import { addDays, MIN, sod } from "./dates";
import { sessionProject, type Task } from "./tasks";

export interface BreakEntry { from: number; to: number; long?: boolean; nudge?: string }

export type DayItem =
  | { kind: "focus"; from: number; to: number; ms: number; title: string; label: string; full: boolean; over?: boolean; flow?: boolean; live?: boolean }
  | { kind: "break"; from: number; to: number; long: boolean; nudge?: string; live?: boolean };

const KEEP_DAYS = 30;
/** Shorter gaps are the click between one thing and the next, not idle time. */
export const IDLE_MIN = 2 * MIN;

/** When a run began, read from its id; falls back to the end minus its length. */
export function runStart(run: string | undefined, at: number, ms: number) {
  const id = run || "", body = /^(ot|fl)-/.test(id) ? id.slice(3) : id.slice(0, 8);
  const t = body ? parseInt(body, 36) : NaN;
  return Number.isFinite(t) && t <= at - ms + MIN && t > at - 12 * 60 * MIN ? Math.min(t, at - ms) : at - ms;
}

/** Adds a finished break, once, keeping a month of them. */
export function logBreak(log: BreakEntry[] | undefined, b: BreakEntry, now = Date.now()): BreakEntry[] {
  const cut = addDays(sod(now), -KEEP_DAYS), list = (log || []).filter((x) => x.from >= cut && x.from !== b.from);
  return [...list, b].sort((x, y) => x.from - y.from);
}

/** Focus sessions and breaks that started on a day, in order, with overlaps trimmed. */
export function dayItems(tasks: Iterable<Task>, breaks: BreakEntry[] | undefined, day: number, live: DayItem[] = []): DayItem[] {
  const from = sod(day), to = addDays(from, 1), out: DayItem[] = [];
  for (const t of tasks) for (const s of t.sessions || []) {
    if (s.at < from || s.at >= to + 12 * 60 * MIN) continue;
    const start = runStart(s.run, s.at, s.ms || 0);
    if (start < from || start >= to) continue;
    out.push({
      kind: "focus", from: start, to: s.at, ms: s.ms || 0, title: t.system ? "Unplanned focus" : t.title, label: sessionProject(t, s), full: !!s.full,
      ...(s.run?.startsWith("ot-") ? { over: true } : s.run?.startsWith("fl-") ? { flow: true } : {}),
    });
  }
  for (const b of breaks || []) if (b.from >= from && b.from < to) out.push({ kind: "break", from: b.from, to: b.to, long: !!b.long, ...(b.nudge ? { nudge: b.nudge } : {}) });
  for (const l of live) if (l.from >= from && l.from < to) out.push({ ...l });
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  let end = 0;
  return out.filter((x) => {
    if (x.to <= end) return false;
    if (x.from < end) x.from = end;
    end = x.to;
    return true;
  });
}

/** Stretches between one thing and the next when neither focus nor a break was running. */
export function dayGaps(items: DayItem[]) {
  const out: { from: number; to: number }[] = [];
  for (let i = 1; i < items.length; i++) if (items[i].from - items[i - 1].to >= IDLE_MIN) out.push({ from: items[i - 1].to, to: items[i].from });
  return out;
}

/**
 * Finished cycles and flows that something followed, and how many of them a break followed.
 * Time past the bell continues the cycle before it, so its break counts for both.
 */
export function breaksTaken(items: DayItem[]) {
  let due = 0, taken = 0;
  items.forEach((x, i) => {
    if (x.kind !== "focus" || x.live || !(x.full || x.flow)) return;
    let j = i + 1;
    while (items[j]?.kind === "focus" && (items[j] as { over?: boolean }).over) j++;
    const next = items[j];
    if (!next) return;
    due++;
    if (next.kind === "break" && next.from - items[j - 1].to < IDLE_MIN) taken++;
  });
  return { due, taken };
}

/** The day's totals: focus, full cycles, short and long breaks, the nudges done in them, and the time between. What's still running counts once it's logged. */
export function daySummary(items: DayItem[]) {
  let focus = 0, cycles = 0, breaks = 0, rest = 0, long = 0, nudges = 0;
  for (const it of items) {
    if (it.live) continue;
    if (it.kind === "focus") { focus += it.ms; if (it.full) cycles++; }
    else { breaks++; if (it.long) long += it.to - it.from; else rest += it.to - it.from; if (it.nudge) nudges++; }
  }
  const idle = dayGaps(items).reduce((n, g) => n + g.to - g.from, 0);
  return { focus, cycles, breaks, rest, long, nudges, idle, start: items[0]?.from ?? 0, end: items.at(-1)?.to ?? 0, ...breaksTaken(items) };
}
