import { MIN, pad } from "./dates";

export type Rhythm = "25/5" | "50/10";
export const RHYTHMS: { id: Rhythm; name: string }[] = [{ id: "25/5", name: "Classic" }, { id: "50/10", name: "Deep work" }];

/** A public room as the lobby lists it. */
export interface Listed { code: string; title: string; rhythm: Rhythm; house: boolean; max: number; names: string[] }

export const SIZE = { min: 2, max: 12 };

export interface Phase { focus: boolean; start: number; end: number }

const minsOf = (r: Rhythm) => r.split("/").map(Number);

/** Where a room clock is at `now`. Rounds start on the hour, and on the half hour for 25/5. */
export function phaseAt(r: Rhythm, now: number): Phase {
  const [f, b] = minsOf(r), cycle = (f + b) * MIN, round = Math.floor(now / cycle) * cycle, split = round + f * MIN;
  return now < split ? { focus: true, start: round, end: split } : { focus: false, start: split, end: round + cycle };
}

/** When the next focus round starts; now, if one just began. */
export function nextRound(r: Rhythm, now: number) {
  const p = phaseAt(r, now);
  return p.focus ? p.start : p.end;
}

const STEP_MS = 3000;

/** Whether a running timer ends with the room clock's current phase. */
export function inStep(r: Rhythm, t: { mode: string; status: string; endsAt: number }, now: number) {
  const p = phaseAt(r, now);
  return t.status === "running" && (t.mode === "focus") === p.focus && Math.abs(t.endsAt - p.end) < STEP_MS;
}

/** Whether a phase of this mode that ended at `at` ended with the room clock. */
export function endedInStep(r: Rhythm, mode: string, at: number) {
  const p = phaseAt(r, at - STEP_MS);
  return (mode === "focus") === p.focus && Math.abs(p.end - at) < STEP_MS;
}

export const hhmm = (t: number) => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };

/** Busiest rooms first, full ones last; house rooms win a tie. */
export function sortRooms(rooms: Listed[]) {
  const rank = (r: Listed) => (r.names.length >= r.max ? -1 : r.names.length);
  return [...rooms].sort((a, b) => rank(b) - rank(a) || Number(b.house) - Number(a.house) || a.title.localeCompare(b.title));
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "?") + (words.length > 1 ? words[words.length - 1][0] : words[0]?.[1] || "")).toUpperCase();
}

export function hueOf(name: string) {
  let h = 0;
  for (const c of name.toLocaleLowerCase()) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h % 360;
}
