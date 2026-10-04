import { pad } from "./dates";

export type Mode = "focus" | "short" | "long";
/** A member's timer as the room reports it; `end` is already shifted to this clock. */
export type MateTimer = { mode: Mode; status: "idle" | "running" | "paused"; rem: number; total: number; end?: number };
export type Member = { id: string; name: string; owner: boolean; s: MateTimer | null };
export type Proposal = { by: string; yes: string[] };

export const MODE_NAME: Record<Mode, string> = { focus: "Focus", short: "Short break", long: "Long break" };

export const normCode = (v: unknown) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const othersOf = (members: Member[], you: string | null) => members.filter((m) => m.id !== you);

export const clock = (secs: number) => pad(Math.floor(secs / 60)) + ":" + pad(secs % 60);

/** What a member's timer shows: a live countdown while running, the frozen time while paused. */
export function mateClock(s: MateTimer, now: number) {
  return s.status === "running" ? clock(Math.max(0, Math.ceil(((s.end || 0) - now) / 1000))) : clock(Math.ceil(s.rem / 1000));
}

/** How far through its phase a member's timer is, as the ring angle and its hover text. */
export function mateProgress(s: MateTimer | null, now: number) {
  const remaining = s ? Math.max(0, s.status === "running" ? (s.end || 0) - now : s.rem) : 0;
  const p = !s || s.status === "idle" || !s.total ? 0 : Math.min(1, Math.max(0, 1 - remaining / s.total));
  return { deg: p * 360 + "deg", title: s && s.status !== "idle" ? Math.floor(p * 100) + "% complete" : "Ready to focus" };
}

/** The sync request banner: whose request it is, how far the vote got, and what this member can still do. */
export function askOf(prop: Proposal | null, members: Member[], you: string | null) {
  if (!prop) return null;
  const by = members.find((m) => m.id === prop.by) || null;
  const count = prop.yes.length + " of " + members.length + " accepted";
  const kind = prop.by === you ? "mine" : prop.yes.includes(you as string) ? "accepted" : "asked";
  return { kind, by, count };
}
