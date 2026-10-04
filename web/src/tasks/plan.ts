import { fmtClock } from "../format";
import { MIN, sod } from "../lib/dates";
import { cyclesOf } from "../lib/tasks";
import { S, T, type Task } from "../state";
import { dur, remNow } from "../timer/engine";
import { isToday, openOf, viewTasks } from "./derived";

export interface TaskStart { late?: boolean; start?: number; end?: number; text: string; hint: string }

/** When each of Today's tasks should start and end, and the day's totals. */
export type StartPlan = Map<string, TaskStart> & {
  focus: number; breaks: number; end: number; endAt: number; over: boolean;
  /** Tasks that won't finish before the workday ends, and every task still to start. */
  late: string[]; rest: string[];
};

export function taskStartPlan(): StartPlan {
  const today = openOf(viewTasks()).filter(isToday);
  const current = T.mode === "focus" && T.status !== "idle" ? today.find((t) => t.id === S.activeId) : null;
  const sequence = current ? [current, ...today.filter((t) => t !== current)] : today;
  const remaining = (t: Task) => Math.max(t === current ? 1 : 0, (t.est || 0) - cyclesOf(t));
  let cursor = Date.now(), index = T.mode === "long" ? 0 : T.setIndex || 0;
  const nextBreak = () => {
    if (index >= S.settings.longEvery) { index = 0; return dur("long"); }
    return dur("short");
  };
  if (T.mode !== "focus") cursor += remNow();
  else if (T.status !== "idle" && !current) { cursor += remNow(); index++; cursor += nextBreak(); }
  let cyclesLeft = sequence.reduce((n, t) => n + remaining(t), 0);
  const we = S.settings.workdayEnd, endAt = we ? sod(Date.now()) + (+we.slice(0, 2)) * 3600000 + (+we.slice(3)) * MIN : Infinity;
  // Once the workday is over every task is "late", so stop flagging and just offer to move what's left.
  const plan: StartPlan = Object.assign(new Map<string, TaskStart>(), { focus: 0, breaks: 0, late: [], rest: [], end: 0, endAt, over: Date.now() >= endAt });
  for (const t of sequence) {
    const cycles = remaining(t);
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
      hint: (t === current ? "Estimated to finish ~" + fmtClock(end) : "Estimated ~" + fmtClock(start) + " – " + fmtClock(end)) + ", including the short and long breaks in your settings. " + (current ? "Finish the current task first, then follow Today’s order." : "Tasks follow Today’s order; paused timers are assumed to resume now.") });
  }
  plan.end = cursor;
  return plan;
}
