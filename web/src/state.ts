import type { Label } from "./lib/labels";
import type { SavedMix } from "./lib/mix";
import type { PhaseMorph } from "./lib/phaseMorph";
import type { Nudge } from "./lib/nudges";
import type { Repeat } from "./lib/repeat";
import type { Rollover } from "./lib/rollover";
import type { Scape } from "./lib/soundscape";
import type { Task } from "./lib/tasks";
import type { Mode, Status } from "./lib/timer";
import type { WeekPlan } from "./lib/weekPlan";

export type { Task };
export type View = "today" | "upcoming" | "later";

export const DEMO = new URLSearchParams(location.search).get("demo") === "1";

export interface Section { id: string; title: string }

export interface Settings {
  focus: number; short: number; long: number; longEvery: number;
  autoBreak: boolean; autoFocus: boolean; sound: boolean; notify: boolean;
  goal: number; ticking: boolean; tickVolume: number; tickPace: number; autoFloat: boolean;
  workdayEnd: string; sections: Section[];
  /** Off hides room reactions both ways; unset means on. */
  reactions?: boolean;
  rollover?: Rollover;
  /** Unset means off. Superseded by scapeFocus and scapeBreak once either is set. */
  soundscape?: Scape | "off"; soundscapeVolume?: number; soundscapeBreaks?: boolean;
  /** Mixes like "rain:70,fire:40"; empty is off. */
  scapeFocus?: string; scapeBreak?: string; scapeMixes: SavedMix[];
  weeklyRecap: boolean;
  /** Break nudges; unset means the presets. */
  nudges?: Nudge[];
  /** When each nudge was last offered, and how many were done per day. */
  nudgeSeen?: Record<string, number>; nudgeLog?: Record<string, number>;
  /** The week (its first day) whose visit already showed a recap. */
  recapSeen: string;
  weeklyPlan: boolean; plans: WeekPlan[];
  /** The week whose planning prompt was answered or waved off. */
  planSeen: string;
  /** The year whose Year in focus was already offered in December. */
  yearSeen?: number;
  /** How the timer changes colour between phases; unset means the wipe. */
  phaseMorph?: PhaseMorph;
}

export const DEF: Settings = { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoFocus: false, sound: true, notify: false, goal: 8, ticking: false, tickVolume: 20, tickPace: 2, autoFloat: false, workdayEnd: "", sections: [], scapeMixes: [], weeklyRecap: true, recapSeen: "", weeklyPlan: true, plans: [], planSeen: "" };

export const clone = <V>(o: V): V => JSON.parse(JSON.stringify(o));

/** localStorage as JSON; demo mode reads defaults and never writes. */
export const ls = {
  get<V>(k: string, d?: V): V { if (DEMO) return d as V; try { const v = localStorage.getItem(k); return v == null ? (d as V) : JSON.parse(v); } catch { return d as V; } },
  set(k: string, v: unknown) { if (DEMO) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export const ss = {
  get(k: string): string | null { if (DEMO) return null; try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { if (DEMO) return; try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} },
};

export interface AppState {
  tasks: Map<string, Task>; settings: Settings; activeId: string | null; started: boolean; storeMode: "local" | "db";
  newEst: number; newWhen: string | null; newKeep: string[]; confirmDel: string | null;
  newRepeat: Repeat | null;
  subtaskDrafts: Map<string, string>; openTask: string | null; taskView: View; projectFilter: string; labels: Label[]; newLabel: string;
  /** The task just dropped after a drag, so its row can flash. */
  dropped?: { id: string; at: number } | null;
}

export const S: AppState = {
  tasks: new Map(), settings: { ...DEF }, activeId: ls.get("pl.active", null),
  started: ls.get("pl.started", false), storeMode: "local", newEst: 2, newWhen: null, newKeep: [],
  confirmDel: null, newRepeat: null,
  subtaskDrafts: new Map(), openTask: null, taskView: "today", projectFilter: "", labels: [], newLabel: "",
};

export interface Timer {
  mode: Mode; status: Status; remaining: number | null; endsAt: number; total: number; setIndex: number;
  /** Paused phases you switched away from, resumed when you switch back. */
  saved: Partial<Record<Mode, { remaining: number; total: number }>>;
  /** Minutes added to or taken from a phase before it starts. */
  adj: Partial<Record<Mode, number>>;
  run?: string;
  /** When a count-up session started; while it's set, the clock counts up instead of down. */
  up?: number;
  upKind?: "over" | "flow";
  /** When the last focus cycle rang, which a "Keep going" counts from. */
  bellAt?: number;
  /** The break's nudge, if any. */
  nudge?: { id: string; text: string; done?: boolean };
}

const timerOf = (o: object): Timer => Object.assign({ mode: "focus", status: "idle", remaining: null, endsAt: 0, total: 0, setIndex: 0, saved: {}, adj: {} } as Timer, o);

/** The one timer. A state from another device replaces its fields in place, so modules can hold on to it. */
export const T: Timer = timerOf(ls.get("pl.timer", {}));

export function replaceTimer(o: object) {
  for (const k of Object.keys(T)) delete (T as unknown as Record<string, unknown>)[k];
  Object.assign(T, timerOf(o));
}
