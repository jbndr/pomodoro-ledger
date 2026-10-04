import type { Label } from "./lib/labels";
import type { Repeat } from "./lib/repeat";
import type { Rollover } from "./lib/rollover";
import type { Scape } from "./lib/soundscape";
import type { Task } from "./lib/tasks";
import type { Mode, Status } from "./lib/timer";

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
  /** Unset means off. */
  soundscape?: Scape | "off"; soundscapeVolume?: number; soundscapeBreaks?: boolean;
  weeklyRecap: boolean;
  /** The week (its first day) whose visit already showed a recap. */
  recapSeen: string;
}

export const DEF: Settings = { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoFocus: false, sound: true, notify: false, goal: 8, ticking: false, tickVolume: 20, tickPace: 2, autoFloat: false, workdayEnd: "", sections: [], weeklyRecap: true, recapSeen: "" };

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
}

const timerOf = (o: object): Timer => Object.assign({ mode: "focus", status: "idle", remaining: null, endsAt: 0, total: 0, setIndex: 0, saved: {}, adj: {} } as Timer, o);

/** The one timer. A state from another device replaces its fields in place, so modules can hold on to it. */
export const T: Timer = timerOf(ls.get("pl.timer", {}));

export function replaceTimer(o: object) {
  for (const k of Object.keys(T)) delete (T as unknown as Record<string, unknown>)[k];
  Object.assign(T, timerOf(o));
}
