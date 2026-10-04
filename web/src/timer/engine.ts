import { toast } from "../chrome/notice.svelte";
import { Cloud } from "../cloud";
import { autoFloat } from "../float";
import { fmtDur } from "../format";
import { MIN } from "../lib/dates";
import { MODES, type Mode } from "../lib/timer";
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
export const remNow = () => (T.status === "running" ? Math.max(0, T.endsAt - Date.now()) : T.status === "paused" ? T.remaining ?? 0 : base(T.mode));

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
  ls.set("pl.timer", T); ls.set("pl.active", S.activeId); arm(); syncTicking();
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

export function flushPartial() {
  if (T.mode !== "focus" || T.status === "idle") return;
  const el = (T.total || dur("focus")) - remNow();
  if (el >= MIN) { logFocus(el, false, Date.now()); toast("Logged " + fmtDur(el) + " of focus."); }
}

export function setMode(m: Mode, keep?: boolean) {
  if (!keep) delete T.adj[T.mode];
  if (T.mode === "long" && m !== "long" && (T.status !== "idle" || T.setIndex >= S.settings.longEvery)) T.setIndex = 0;
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
  if (T.status === "idle") { T.total = base(T.mode); T.remaining = T.total; T.run = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); delete T.adj[T.mode]; }
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
    if (follow && T.setIndex >= S.settings.longEvery) T.setIndex = 0;
    next = T.setIndex >= S.settings.longEvery ? "long" : "short";
    delete T.saved[next];
  } else next = "focus";
  const rang = releaseBell(at);
  if (!rang && !stale) playSound(wasFocus ? "focus" : "break");
  if (!stale && !document.hidden) buzz([60, 80, 60]);
  setMode(next);
  const auto = wasFocus ? S.settings.autoBreak : S.settings.autoFocus;
  if (follow && !stale) followRoom();
  // Starting from the end time, not now, lets every synced device arrive at the same next phase.
  else if (auto && !stale) start(at);
  const t = S.activeId && S.tasks.get(S.activeId);
  const msg = wasFocus ? ("Cycle done" + (t ? " on “" + t.title + "”" : "") + ". " + (next === "long" ? "Take a long break." : "Take a short break.")) : "Break's over. Ready for the next cycle.";
  toast(msg);
  if (!stale) notify(msg);
  if (wasFocus && !stale) roomRoundEnded();
}

export const toggle = () => (T.status === "running" ? pause() : start());

// Android only; iOS has no vibration API.
export const buzz = (pattern: number | number[]) => { try { if (navigator.vibrate && matchMedia("(hover: none)").matches) navigator.vibrate(pattern); } catch {} };

export function adjust(min: number) {
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
export function skip() { const run = T.status === "running"; flushPartial(); setMode(T.mode === "focus" ? "short" : "focus"); if (run) start(); }

export function tick() {
  if (T.status === "running" && Date.now() >= T.endsAt) complete(T.endsAt);
  renderTimer(false);
  if (RM.code) roomTick();
}
