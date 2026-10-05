import { pad } from "./dates";

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



