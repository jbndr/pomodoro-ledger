import { addDays, dayKey, keyTime, type DayKey } from "./dates";
import type { Task } from "./tasks";

/** What happens to unfinished tasks from earlier days when a new day starts. */
export type Rollover = "always" | "ask" | "never";

export const rolloverMode = (v: unknown): Rollover => (v === "always" || v === "never" ? v : "ask");

/** Open tasks planned for a day before `tk`. They already show in Today, marked with their day. */
export const leftovers = (tasks: Iterable<Task>, tk: DayKey): Task[] => [...tasks].filter((t) => !t.done && !t.system && !t.sample && !!t.plan && t.plan < tk);

export function leftoverText(list: Task[], tk: DayKey): string {
  const yesterday = dayKey(addDays(keyTime(tk), -1));
  return (list.length === 1 ? "1 unfinished task" : list.length + " unfinished tasks") + (list.every((t) => t.plan === yesterday) ? " from yesterday" : " from earlier days");
}

export const carriedOver = (t: Task, tk: DayKey): Task => ({ ...t, today: true, plan: tk });
