import { pad } from "./dates";
import { cyclesOf, projectOf, type Task } from "./tasks";

export type Mode = "focus" | "short" | "long";
export type Status = "idle" | "running" | "paused";

export const MODE_NAME: Record<Mode, string> = { focus: "Focus", short: "Short break", long: "Long break" };
export const MODES = Object.keys(MODE_NAME) as Mode[];

/** Minutes and seconds; minutes go past two digits for sessions over 99 minutes. */
export const clock = (secs: number) => pad(Math.floor(secs / 60)) + ":" + pad(secs % 60);
export const clockLabel = (secs: number) => Math.floor(secs / 60) + " minutes " + (secs % 60) + " seconds remaining";

/** Share of the session still left, 1 at the start. */
export const fraction = (rem: number, total: number) => Math.max(0, Math.min(1, rem / total));

const R = 112;
export const CIRCUMFERENCE = 2 * Math.PI * R;
export const arcOffset = (frac: number) => (CIRCUMFERENCE * (1 - frac)).toFixed(2);

export function knobAt(frac: number) {
  const a = frac * 2 * Math.PI - Math.PI / 2;
  return { cx: (150 + R * Math.cos(a)).toFixed(2), cy: (150 + R * Math.sin(a)).toFixed(2) };
}

export const litTicks = (frac: number) => Math.ceil(frac * 60);

export const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * 2 * Math.PI - Math.PI / 2, major = i % 5 === 0, r1 = major ? 128 : 132, r2 = 142;
  return {
    major,
    x1: (150 + r1 * Math.cos(a)).toFixed(2), y1: (150 + r1 * Math.sin(a)).toFixed(2),
    x2: (150 + r2 * Math.cos(a)).toFixed(2), y2: (150 + r2 * Math.sin(a)).toFixed(2),
  };
});

export const modeLabel = (mode: Mode, setIndex: number, every: number) =>
  MODE_NAME[mode] + (mode === "focus" ? " · " + Math.min(Math.min(setIndex || 0, every) + 1, every) + " of " + every : "");

export const startLabel = (status: Status) => (status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start");

/** One class per cycle dot until the long break, and the caption after them. */
export function setDots(mode: Mode, status: Status, setIndex: number, every: number) {
  const idx = Math.min(setIndex || 0, every), dots: string[] = [];
  for (let i = 0; i < every; i++) dots.push(i < idx ? "on" : i === idx && mode === "focus" && status === "running" ? "now" : "");
  return { dots, text: mode === "long" ? "long break" : every - idx + " to long break" };
}

export interface PickOption { id: string; title: string; meta?: string }

/** The "Working on" choices: no task, every open task, and the active task if it's already finished. */
export function pickOptions(open: Task[], active: Task | null | undefined) {
  const opts: PickOption[] = [{ id: "", title: "Unplanned focus (no task)" }];
  for (const t of open) opts.push({ id: t.id, title: t.title, meta: (projectOf(t) ? projectOf(t) + " · " : "") + cyclesOf(t) + "/" + (t.est || 0) });
  if (active && active.done) opts.push({ id: active.id, title: active.title + " (finished)" });
  return { opts, cur: Math.max(0, opts.findIndex((o) => o.id === (active ? active.id : ""))) };
}
