import { projectOf, type Session, type Task } from "./tasks";

/** Cycles a session is worth: logged cycles as logged, anything else (flow, past the bell, stopped early) by its length. */
export function sessionCycles(s: Session, focusMs: number): number {
  if (s.full) { const n = (s as { cycles?: number }).cycles; return n && n > 1 ? Math.floor(n) : 1; }
  return focusMs > 0 ? (s.ms || 0) / focusMs : 0;
}

export const tookOf = (t: Task, focusMs: number) => (t.sessions || []).reduce((a, s) => a + sessionCycles(s, focusMs), 0);

export interface Pace {
  /** Took ÷ planned. */
  ratio: number;
  /** Finished tasks it was learned from. */
  n: number;
}

export interface Paces { all: Pace | null; labels: Map<string, Pace> }

export const PACE = { days: 120, recent: 40, perLabel: 20, min: 3, prior: 4, cap: 4, lo: 0.5, hi: 3 };

/** Took ÷ planned over finished tasks, pulled toward `base` by a few cycles so a handful of tasks can't swing it. */
function paceOf(list: { est: number; took: number }[], base: number): Pace | null {
  if (list.length < PACE.min) return null;
  const planned = list.reduce((a, x) => a + x.est, 0), took = list.reduce((a, x) => a + Math.min(x.took, x.est * PACE.cap), 0);
  const ratio = (took + PACE.prior * base) / (planned + PACE.prior);
  return { ratio: Math.min(PACE.hi, Math.max(PACE.lo, ratio)), n: list.length };
}

/** How long recently finished tasks took against their estimates, overall and per label. */
export function learnPace(tasks: Iterable<Task>, focusMs: number, now = Date.now()): Paces {
  const since = now - PACE.days * 864e5, fin: { est: number; took: number; label: string; at: number }[] = [];
  for (const t of tasks) {
    if (!t.done || t.system || !(t.est! > 0) || (t.doneAt || 0) < since) continue;
    const took = tookOf(t, focusMs);
    if (took > 0) fin.push({ est: t.est!, took, label: projectOf(t), at: t.doneAt! });
  }
  fin.sort((a, b) => b.at - a.at);
  const all = paceOf(fin.slice(0, PACE.recent), 1), labels = new Map<string, Pace>(), by = new Map<string, typeof fin>();
  for (const x of fin) if (x.label) by.set(x.label, [...(by.get(x.label) || []), x]);
  for (const [name, list] of by) { const p = paceOf(list.slice(0, PACE.perLabel), all?.ratio ?? 1); if (p) labels.set(name, p); }
  return { all, labels };
}

/** The pace for a task with this label: the label's own once it has enough history, otherwise everything's. */
export const paceFor = (p: Paces, label: string) => (label && p.labels.get(label)) || p.all;

/** Cycles a task estimated at `est` is likely to take at `ratio`. */
export const expectedCycles = (est: number, ratio: number) => (est > 0 ? Math.max(1, Math.round(est * ratio)) : 0);

/** A ratio such as "1.6×". */
export const paceText = (r: number) => r.toFixed(1).replace(/\.0$/, "") + "×";
