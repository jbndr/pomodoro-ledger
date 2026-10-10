import { toast } from "../chrome/notice.svelte";
import { Cloud } from "../cloud";
import { announce } from "../extension";
import { autoFloat } from "../float";
import { fmtDur } from "../format";
import { MIN } from "../lib/dates";
import { dayKey } from "../lib/dates";
import { logBreak } from "../lib/day";
import { logNudge, nudgesOf, pickNudge, type NudgeContext } from "../lib/nudges";
import { extraBreakMin, flowBreakMin, MODES, roundsStale, type Mode } from "../lib/timer";
import { renderAll, renderTimer } from "../render";
import { followRoom, roomFollows, roomRoundEnded, roomTick, RM } from "../room/net";
import { cancelEnd, ensureAudio, playSound, releaseBell, scheduleEnd, syncTicking } from "../sound";
import { clone, DEF, ls, replaceTimer, S, T } from "../state";
import { Store } from "../store";
import { markStarted, preview, unplanned } from "../tasks/derived";

/** A timer as another device sends it. */
export interface TimerDoc { T?: object; activeId?: string | null }

export const MAX_RUN = 180 * MIN;
export const dur = (m: Mode) => (S.settings[m] || DEF[m]) * MIN;
const base = (m: Mode) => Math.max(MIN, dur(m) + (T.adj[m] || 0));
export const totalNow = () => (T.status === "idle" ? base(T.mode) : T.total || dur(T.mode));
export const remNow = () => (T.up ? 0 : T.status === "running" ? Math.max(0, T.endsAt - Date.now()) : T.status === "paused" ? T.remaining ?? 0 : base(T.mode));
/** Time counted up so far in a "keep going" or flow session. */
export const upNow = () => (T.up ? Math.max(0, Math.min(MAX_RUN, Date.now() - T.up)) : 0);

// Worker timers aren't throttled in background tabs, so a phase ends (and notifies) on time.
let W: Worker | null = null;
try {
  W = new Worker(URL.createObjectURL(new Blob(["let t;onmessage=(e)=>{clearTimeout(t);if(e.data>=0)t=setTimeout(()=>postMessage(0),e.data+30)}"], { type: "text/javascript" })));
  W.onmessage = () => tick();
} catch {}
export const arm = () => { if (W) W.postMessage(T.status === "running" ? Math.max(0, T.endsAt - Date.now()) : -1); };

// Quiet saves (late catch-up completions, states received from another device) aren't new changes, so they don't sync out.
let timerQuiet = false;
export const saveTimer = () => {
  ls.set("pl.timer", T); ls.set("pl.active", S.activeId); arm(); syncTicking(); announce();
  if (!timerQuiet) { ls.set("pl.timerAt", Date.now()); Cloud.pushTimer(); }
};

export function applyTimer(body: TimerDoc, at: number) {
  if (!body || !body.T) return;
  timerQuiet = true;
  try {
    replaceTimer(body.T);
    if (!MODES.includes(T.mode)) T.mode = "focus";
    S.activeId = body.activeId && S.tasks.has(body.activeId) ? body.activeId : null;
    ls.set("pl.timerAt", at);
    cancelEnd(); saveTimer();
    if (T.status === "running") { scheduleEnd(); wakeOn(); } else wakeOff();
  } finally { timerQuiet = false; }
  renderAll();
}

let wake: WakeLockSentinel | null = null;
export async function wakeOn() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch {} }
export function wakeOff() { try { wake && wake.release(); } catch {} wake = null; }

function logFocus(ms: number, full: boolean, at: number, run?: string) {
  if (preview()) markStarted(true);
  const t = clone((S.activeId && S.tasks.get(S.activeId)) || unplanned(at));
  // Another synced device may have logged this same run already.
  if (run && (t.sessions || []).some((s) => s.run === run)) return;
  t.sessions = [...(t.sessions || []), { at, ms: Math.round(ms), full, ...(run ? { run } : {}) }];
  Store.saveTask(t);
}

/** Logs the break that's ending, if it ran for at least a minute. A paused break ends where its clock stopped. */
function endBreak(at: number) {
  const from = T.breakFrom;
  if (!from) return;
  delete T.breakFrom;
  const to = T.status === "paused" ? Math.min(at, from + Math.max(0, T.total - (T.remaining ?? 0))) : at;
  if (T.mode === "focus" || to - from < MIN) return;
  S.settings.breakLog = logBreak(S.settings.breakLog, { from, to, ...(T.mode === "long" ? { long: true } : {}), ...(T.nudge?.done ? { nudge: T.nudge.text } : {}) });
  Store.saveSettings();
}

export function flushPartial() {
  if (T.mode !== "focus" || T.status === "idle") return;
  const el = T.up ? upNow() : (T.total || dur("focus")) - remNow();
  if (el >= MIN) { logFocus(el, false, Date.now()); toast("Logged " + fmtDur(el) + " of focus."); }
}

export function setMode(m: Mode, keep?: boolean) {
  endBreak(Date.now());
  if (!keep) delete T.adj[T.mode];
  delete T.up; delete T.upKind; delete T.flowReady;
  if (m === "focus") delete T.nudge;
  if (T.mode === "long" && m !== "long" && T.setIndex >= S.settings.longEvery) T.setIndex = 0;
  if (keep && T.status !== "idle") T.saved[T.mode] = { remaining: remNow(), total: T.total };
  const s = T.saved[m];
  delete T.saved[m];
  T.mode = m; T.status = s ? "paused" : "idle"; T.remaining = s ? s.remaining : null; T.endsAt = 0; T.total = s ? s.total : 0;
  cancelEnd(); wakeOff(); saveTimer(); renderTimer(true);
}

export function start(from?: number) {
  ensureAudio();
  if (preview()) { markStarted(); }
  if (T.status === "running") return;
  if (T.flowReady && T.status === "idle") { startFlow(from || Date.now()); return; }
  if (T.status === "idle") {
    T.total = base(T.mode); T.remaining = T.total; T.run = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); delete T.adj[T.mode];
    if (T.mode !== "focus") T.breakFrom = from || Date.now();
  }
  T.endsAt = (from || Date.now()) + (T.remaining ?? 0);
  T.status = "running";
  scheduleEnd(); saveTimer(); wakeOn(); renderTimer(true);
  autoFloat();
}

export function pause() {
  if (T.status !== "running") return;
  T.remaining = Math.max(0, T.endsAt - Date.now()); T.status = "paused";
  cancelEnd(); saveTimer(); wakeOff(); renderTimer(true);
}

export function complete(at: number) {
  if (T.up) { stopUp(at); return; }
  const wasFocus = T.mode === "focus";
  const stale = Date.now() - at > MIN;
  timerQuiet = stale;
  try { advance(at, wasFocus, stale); } finally { timerQuiet = false; }
}

function advance(at: number, wasFocus: boolean, stale: boolean) {
  // Public rooms have no long breaks; their clock decides what comes next.
  const follow = roomFollows(at);
  let next: Mode;
  if (wasFocus) {
    logFocus(T.total || dur("focus"), true, at, T.run);
    T.setIndex = (T.setIndex || 0) + 1;
    T.roundAt = at;
    if (follow && T.setIndex >= S.settings.longEvery) T.setIndex = 0;
    next = T.setIndex >= S.settings.longEvery ? "long" : "short";
    dropHeldBreaks();
  } else { endBreak(at); next = "focus"; }
  if (wasFocus && !stale && !follow) T.bellAt = at; else delete T.bellAt;
  const rang = releaseBell(at);
  if (!rang && !stale) playSound(wasFocus ? "focus" : "break");
  if (!stale && !document.hidden) buzz([60, 80, 60]);
  setMode(next);
  if (wasFocus && !stale) offerNudge(next);
  const auto = wasFocus ? S.settings.autoBreak : S.settings.autoFocus;
  if (follow && !stale) followRoom();
  // Starting from the end time, not now, lets every synced device arrive at the same next phase.
  else if (auto && !stale) start(at);
  const t = S.activeId && S.tasks.get(S.activeId);
  const msg = wasFocus ? ("Cycle done" + (t ? " on “" + t.title + "”" : "") + ". " + (next === "long" ? "Take a long break." : "Take a short break.")) : "Break's over. Ready for the next cycle.";
  toast(msg);
  if (!stale) notify(T.nudge ? msg + "\n" + T.nudge.text : msg);
  if (wasFocus && !stale) roomRoundEnded();
}

// Flow counts as focus time but not as a cycle, so goals stay in cycles.
function stopFlow(at: number) {
  const ms = Math.max(0, Math.min(MAX_RUN, at - T.up!));
  if (ms >= MIN) logFocus(ms, false, at, T.run);
  const minutes = flowBreakMin(ms);
  dropHeldBreaks();
  setMode("short");
  T.adj.short = minutes * MIN - dur("short");
  offerNudge("short");
  saveTimer(); renderTimer(true);
  toast(ms >= MIN ? "Logged " + fmtDur(ms) + " of flow. Take a " + minutes + "-minute break." : "Flow stopped before a minute, so nothing was logged.");
  if (S.settings.autoBreak && ms >= MIN) start();
}

/** Picks one quiet body nudge for a break that follows focus. */
/** Focus and breaks since a moment, read from logged sessions; a break follows each full cycle or a long enough run. */
function nudgeContext(): NudgeContext {
  const after = (at: number) => [...S.tasks.values()].flatMap((t) => (t.sessions || []).filter((s) => s.at > at));
  return {
    focusSince: (at) => after(at).reduce((a, s) => a + (s.ms || 0), 0),
    breaksSince: (at) => after(at).filter((s) => s.full || (s.ms || 0) >= 10 * MIN).length,
  };
}

function offerNudge(kind: Mode) {
  if (kind === "focus") return;
  const now = Date.now(), seen = S.settings.nudgeSeen || {}, n = pickNudge(nudgesOf(S.settings.nudges), seen, kind, now, nudgeContext());
  delete T.nudge;
  if (!n) return;
  T.nudge = { id: n.id, text: n.text };
  S.settings.nudgeSeen = { ...seen, [n.id]: now };
  Store.saveSettings(); saveTimer();
}

export function nudgeDone() {
  if (!T.nudge || T.nudge.done) return;
  T.nudge.done = true;
  S.settings.nudgeLog = logNudge(S.settings.nudgeLog || {}, dayKey(Date.now()));
  Store.saveSettings(); saveTimer(); renderTimer(true);
}

/** Starts the rounds over by hand; never while a session runs. */
export function resetRounds() {
  if (T.status === "running") { toast("Pause or finish this session to start the rounds over."); return; }
  if (!T.setIndex) return;
  T.setIndex = 0; delete T.roundAt;
  saveTimer(); renderTimer(true);
  toast("Rounds start over at round 1.");
}

/** Starts the rounds over after a new day or a long pause, so the morning begins at round one. */
export function freshRounds() {
  // Timers saved before roundAt existed fall back to the last time the timer changed.
  const last = T.roundAt || ls.get<number>("pl.timerAt", 0);
  if (!roundsStale(T.setIndex, last, T.status, Date.now(), dayKey)) return;
  T.setIndex = 0;
  delete T.roundAt; delete T.saved.short; delete T.saved.long;
  if (T.mode !== "focus") setMode("focus"); else { saveTimer(); renderTimer(true); }
}

export const toggle = () => (T.up ? stopUp() : T.status === "running" ? pause() : start());

/** "Keep going" is offered for ten minutes after a focus cycle rings, outside rooms, whose shared clock leads. */
export const canKeepGoing = () => !!T.bellAt && T.mode !== "focus" && !RM.code && Date.now() - T.bellAt < 10 * MIN;

/** Goes back to focus, counting up from the bell, so the minutes worked before pressing it count too. */
export function keepGoing() {
  if (!canKeepGoing()) { toast(RM.code ? "In a room, the room's clock leads." : "Keep going works for ten minutes after a cycle ends."); return; }
  const since = T.bellAt!;
  cancelEnd();
  delete T.saved.focus; delete T.bellAt; delete T.breakFrom;
  // The end sits at the longest allowed session, so the blocker, soundscapes and other devices treat it as a running focus.
  Object.assign(T, { mode: "focus", status: "running", up: since, upKind: "over", total: 0, remaining: null, endsAt: since + MAX_RUN, run: "ot-" + since.toString(36) });
  scheduleEnd(); saveTimer(); wakeOn(); renderTimer(true);
  toast("Keep going. Stop when you're done, and your break grows to match.");
}

// A fresh break replaces any break left on hold, so only one ever waits to be resumed.
const dropHeldBreaks = () => { delete T.saved.short; delete T.saved.long; };

/** Picks Flow: a focus that counts up from zero once you press Start. */
export function readyFlow() {
  if (RM.code) { toast("In a room, the room's clock leads."); return; }
  if (T.upKind === "flow") { toast("Flow is running. Stop when you're done."); return; }
  if (T.flowReady) return;
  // Flow earns its own break, so a break you leave for it isn't kept; a started focus logs what it has.
  dropHeldBreaks();
  if (T.mode !== "focus") setMode("focus");
  if (T.status !== "idle") { flushPartial(); setMode("focus"); }
  T.flowReady = true;
  saveTimer(); renderTimer(true);
}

function startFlow(at: number) {
  delete T.flowReady;
  Object.assign(T, { mode: "focus", status: "running", up: at, upKind: "flow", total: 0, remaining: null, endsAt: at + MAX_RUN, run: "fl-" + at.toString(36) });
  scheduleEnd(); saveTimer(); wakeOn(); renderTimer(true);
  autoFloat();
}

/** Ends a count-up session: logs it and starts a break that grows with it. */
export function stopUp(at = Date.now()) {
  if (!T.up) return;
  if (T.upKind === "flow") { stopFlow(at); return; }
  const ms = Math.max(0, Math.min(MAX_RUN, at - T.up)), next: Mode = T.setIndex >= S.settings.longEvery ? "long" : "short";
  if (ms >= MIN) logFocus(ms, false, at, T.run);
  const extra = extraBreakMin(ms);
  dropHeldBreaks();
  setMode(next);
  offerNudge(next);
  if (extra) { T.adj[next] = extra * MIN; saveTimer(); renderTimer(true); }
  toast((ms >= MIN ? "Logged " + fmtDur(ms) + " past the bell." : "Back to your break.") + (extra ? " Your break gets " + extra + " more " + (extra === 1 ? "minute." : "minutes.") : ""));
  if (S.settings.autoBreak) start();
}

// Android only; iOS has no vibration API.
export const buzz = (pattern: number | number[]) => { try { if (navigator.vibrate && matchMedia("(hover: none)").matches) navigator.vibrate(pattern); } catch {} };

export function adjust(min: number) {
  if (T.up) { toast("This session counts up. Stop when you're done."); return; }
  const d = min * MIN, total = totalNow() + d, rem = remNow() + d;
  if (rem < MIN) { toast("A session needs at least a minute left."); return; }
  if (total > MAX_RUN) { toast("A session can't be longer than " + fmtDur(MAX_RUN) + "."); return; }
  if (T.status === "idle") T.adj[T.mode] = total - dur(T.mode);
  else {
    T.total = total; T.remaining = rem;
    if (T.status === "running") { T.endsAt += d; scheduleEnd(); }
  }
  saveTimer(); renderTimer(true);
}

export function notify(body: string) {
  if (!S.settings.notify || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification("Pomodoro Ledger", { body, tag: "pomodoro-ledger" });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

// Skipping keeps the clock going if it was running.
export function skip() { if (T.up) { stopUp(); return; } const run = T.status === "running"; flushPartial(); setMode(T.mode === "focus" ? "short" : "focus"); if (run) start(); }

export function tick() {
  if (T.status === "running" && Date.now() >= T.endsAt) complete(T.endsAt);
  renderTimer(false);
  if (RM.code) roomTick();
}
