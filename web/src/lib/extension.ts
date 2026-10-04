import type { Mode, Status } from "./timer";

export const EXTENSION_URL = "https://github.com/jbndr/pomodoro-ledger/tree/main/extension";

export interface TimerMessage { source: "pomodoro-ledger"; type: "timer"; mode: Mode; status: Status; endsAt: number | null; task: string | null }

/** What the site blocker extension hears about the timer. */
export function timerMessage(t: { mode: Mode; status: Status; endsAt: number }, task?: string | null): TimerMessage {
  const running = t.status === "running" && t.endsAt > 0;
  return { source: "pomodoro-ledger", type: "timer", mode: t.mode, status: running ? "running" : t.status === "running" ? "idle" : t.status, endsAt: running ? t.endsAt : null, task: task?.trim() || null };
}
