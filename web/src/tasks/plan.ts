import { fmtClock } from "../format";
import { MIN, sod } from "../lib/dates";
import { expectedCycles, learnPace, paceFor, paceText, type Paces } from "../lib/pace";
import { cyclesOf, projectOf } from "../lib/tasks";
import { S, T, type Task } from "../state";
import { dur, remNow } from "../timer/engine";
import { isToday, openOf, viewTasks } from "./derived";

export interface TaskStart { late?: boolean; best?: boolean; start?: number; end?: number; text: string; hint: string }

/** When each of Today's tasks should start and end, and the day's totals. */
export type StartPlan = Map<string, TaskStart> & {
  focus: number; breaks: number; end: number; endAt: number; over: boolean;
  /** Cycles your pace adds to (or takes from) the estimates still to go. */
  extra: number;
  /** Tasks that won't finish before the workday ends, and every task still to start. */
  late: string[]; rest: string[];
  /** Today's run of your best time, and the move that would put the biggest task in it. */
  best?: BestPlan;
};

export interface BestPlan { start: number; end: number; hours: string; offer: { id: string; title: string; before: string | null; start: number; now: boolean } | null }

/** Your pace from finished tasks, or null when planning with it is off. */
export const currentPace = (): Paces | null => (S.settings.pace === false ? null : learnPace(viewTasks().values(), dur("focus")));

/** The estimate and what it likely takes at your pace, when that differs. */
export function pacedEst(p: Paces | null, est: number, label: string): { cycles: number; text: string } | null {
  const r = p && est > 0 ? paceFor(p, label) : null, cycles = r ? expectedCycles(est, r.ratio) : est;
  if (!r || cycles === est) return null;
  return { cycles, text: (label && p!.labels.has(label) ? label + " tasks" : "Tasks") + " take you about " + paceText(r.ratio) + " what you plan, so expect ~" + cycles + " instead of " + est + "." };
}

/** What Settings says about your pace. */
export function paceLine() {
  const p = learnPace(viewTasks().values(), dur("focus"));
  if (!p.all) return "Once you've finished a few tasks that have an estimate, Today plans with how long they really take you.";
  const labels = [...p.labels].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([name, x]) => name + " " + paceText(x.ratio));
  return "Lately your tasks take about " + paceText(p.all.ratio) + " what you plan" + (labels.length ? " (" + labels.join(", ") + ")" : "") + ".";
}

/** Plans Today in its list order, or in the given order. */
export function taskStartPlan(order?: Task[]): StartPlan {
  const today = order || openOf(viewTasks()).filter(isToday);
  const current = T.mode === "focus" && T.status !== "idle" ? today.find((t) => t.id === S.activeId) : null;
  const sequence = current ? [current, ...today.filter((t) => t !== current)] : today;
  const pace = currentPace(), paced = new Map(sequence.map((t) => [t, pacedEst(pace, t.est || 0, projectOf(t))]));
  const remaining = (t: Task) => Math.max(t === current ? 1 : 0, (paced.get(t)?.cycles ?? t.est ?? 0) - cyclesOf(t));
  const rawLeft = (t: Task) => Math.max(t === current ? 1 : 0, (t.est || 0) - cyclesOf(t));
  let cursor = Date.now(), index = T.mode === "long" && T.setIndex >= S.settings.longEvery ? 0 : T.setIndex || 0;
  const nextBreak = () => {
    if (index >= S.settings.longEvery) { index = 0; return dur("long"); }
    return dur("short");
  };
  if (T.mode !== "focus") cursor += remNow();
  else if (T.status !== "idle" && !current) { cursor += remNow(); index++; cursor += nextBreak(); }
  let cyclesLeft = sequence.reduce((n, t) => n + remaining(t), 0);
  const we = S.settings.workdayEnd, endAt = we ? sod(Date.now()) + (+we.slice(0, 2)) * 3600000 + (+we.slice(3)) * MIN : Infinity;
  // Once the workday is over every task is "late", so stop flagging and just offer to move what's left.
  const plan: StartPlan = Object.assign(new Map<string, TaskStart>(), { focus: 0, breaks: 0, extra: 0, late: [], rest: [], end: 0, endAt, over: Date.now() >= endAt });
  for (const t of sequence) {
    const cycles = remaining(t), p = paced.get(t);
    plan.extra += cycles - rawLeft(t);
    if (!cycles) { plan.set(t.id, { text: "Estimate met", hint: "All estimated cycles for this task are complete. Increase the estimate to plan more time." }); continue; }
    const start = cursor;
    let end = cursor;
    for (let i = 0; i < cycles; i++) {
      const focus = t === current && i === 0 ? remNow() : dur("focus");
      cursor += focus; plan.focus += focus; end = cursor;
      index++; cyclesLeft--;
      if (cyclesLeft) { const rest = nextBreak(); cursor += rest; plan.breaks += rest; }
    }
    const late = !plan.over && t !== current && end > endAt;
    if (late) plan.late.push(t.id);
    if (t !== current) plan.rest.push(t.id);
    plan.set(t.id, { late, start, end, text: t === current ? T.status === "running" ? "In progress" : "Resume now" : "Starts ~" + fmtClock(start),
      hint: (t === current ? "Estimated to finish ~" + fmtClock(end) : "Estimated ~" + fmtClock(start) + " – " + fmtClock(end)) + ", including the short and long breaks in your settings. " + (p ? p.text + " " : "") + (current ? "Finish the current task first, then follow Today’s order." : "Tasks follow Today’s order; paused timers are assumed to resume now.") });
  }
  plan.end = cursor;
  return plan;
}
