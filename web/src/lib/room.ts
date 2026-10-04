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

export const REACTIONS = ["👋", "🎉", "🔥", "👍", "☕"];
/** Gentler than the room's own limit, so a normal user never hits it. */
export const REACT_BURST = 3;
export const REACT_EVERY_MS = 6000;
export const REACT_LIFE_MS = 4000;
export const REACT_MAX = 3;

export type Bucket = { n: number; at: number };
export type Bubble = { key: number; e: string; names: string[]; n: number; at: number };

const tokens = (b: Bucket | null, now: number) => (b ? Math.min(REACT_BURST, b.n + (now - b.at) / REACT_EVERY_MS) : REACT_BURST);

/** The bucket after sending one reaction, or null when it's empty. */
export function takeToken(b: Bucket | null, now: number): Bucket | null {
  const n = tokens(b, now);
  return n >= 1 ? { n: n - 1, at: now } : null;
}

/** How long until the next reaction can go out. */
export const tokenIn = (b: Bucket | null, now: number) => Math.ceil(Math.max(0, 1 - tokens(b, now)) * REACT_EVERY_MS);

let bubbleSeq = 0;

export const liveBubbles =(list: Bubble[], now: number) => list.filter((b) => now - b.at < REACT_LIFE_MS);

/** Adds a reaction; one matching a bubble still showing joins it instead of stacking up. */
export function addBubble(list: Bubble[], e: string, name: string, now: number): Bubble[] {
  const live = liveBubbles(list, now), same = live.find((b) => b.e === e);
  if (same) return live.map((b) => (b === same ? { ...b, names: b.names.includes(name) ? b.names : [...b.names, name], n: b.n + 1, at: now } : b));
  return [...live, { key: ++bubbleSeq, e, names: [name], n: 1, at: now }].slice(-REACT_MAX);
}

export function bubbleNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  const rest = names.length - 2;
  return names.slice(0, 2).join(", ") + " and " + rest + (rest === 1 ? " other" : " others");
}
