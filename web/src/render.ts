import { flushSync } from "svelte";
import { composer } from "./composer/state.svelte";
import { $ } from "./dom";
import { renderFloating } from "./float";
import { MIN } from "./lib/dates";
import { sessionProgress, timerBackdrop, waterLevel } from "./lib/faces";
import { list, pill, progress } from "./lib/redraw.svelte";
import { projectNames } from "./lib/tasks";
import { clock, MODE_NAME } from "./lib/timer";
import { LP, labelPop } from "./popovers/state.svelte";
import { crewPush } from "./room/crew";
import { roomPush } from "./room/net";
import { syncTicking } from "./sound";
import { S, T } from "./state";
import { Labels } from "./store";
import { todayKey, viewTasks } from "./tasks/derived";
import { withBest } from "./tasks/best";
import { taskStartPlan } from "./tasks/plan";
import { remNow, totalNow, upNow } from "./timer/engine";
import { timerView } from "./timer/state.svelte";
import { closeLabelPop, ui } from "./ui";
import { syncActive } from "./tasks/actions";
import { showMode } from "./timer/morph";
import { applySky } from "./sky.svelte";
import { wantHalftone } from "./halftone";
import { applyWeather } from "./weather.svelte";
import { wantWeatherArt } from "./weatherArt";

let lastPhase = "", lastTxt = "", lastFrac = 1, lastFill = -1, fillJump = 0, startEstimateMinute = -1, renderedDay = "";

export function renderTimer(force?: boolean) {
  if (force) syncTicking();
  if (T.mode + T.status !== lastPhase) { lastPhase = T.mode + T.status; syncActive(); }
  showMode(T.mode);
  if (document.body.dataset.status !== T.status) document.body.dataset.status = T.status;
  const backdrop = timerBackdrop(S.settings.backdrop);
  if (document.body.dataset.backdrop !== backdrop) document.body.dataset.backdrop = backdrop;
  applySky(document.documentElement, backdrop === "sky" || backdrop === "weather");
  if (backdrop === "halftone") wantHalftone();
  if (backdrop === "weather") { wantWeatherArt(); applyWeather(document.documentElement); }
  // Past the bell shows "+12:40" on a full ring; flow counts from zero and fills the ring once an hour.
  const kind = T.up ? T.upKind || "over" : T.flowReady ? "flow" : "", total = kind ? 1 : totalNow(), rem = kind ? upNow() : remNow();
  const frac = kind ? 1 : Math.max(0, Math.min(1, rem / total));
  const txt = (kind === "over" ? "+" : "") + clock(kind ? Math.floor(rem / 1000) : Math.ceil(rem / 1000));
  if (txt !== lastTxt || force) {
    lastTxt = txt;
    document.title = T.status === "idle" ? "Pomodoro Ledger" : txt + " · " + (kind === "flow" ? "Flow" : MODE_NAME[T.mode]) + (T.status === "paused" ? " (paused)" : "");
  }
  timerView.set(rem, total, kind, totalNow());
  if (backdrop === "water") fillWater(waterLevel(T.mode, kind, frac, rem));
  if (backdrop === "sweep") document.body.style.setProperty("--sweep", (sessionProgress(kind, frac, rem, totalNow()) * 360).toFixed(1) + "deg");
  else if (lastFill >= 0) { lastFill = -1; delete document.body.dataset.fillReady; }
  lastFrac = frac;
  renderFloating(txt, frac);
  renderTaskStarts(force);
  const tabTime = T.status === "running" ? txt : "Timer";
  if ($("#tabTime").textContent !== tabTime) $("#tabTime").textContent = tabTime;
  if (!force) return;
  roomPush();
  crewPush();
  timerView.refresh();
}

function fillWater(level: number) {
  const v = Math.round(level * 1000) / 1000, body = document.body;
  if (v === lastFill) return;
  // The level glides from one tick to the next, but not from wherever the layer sat before Water was picked.
  if (lastFill < 0) requestAnimationFrame(() => requestAnimationFrame(() => { if (lastFill >= 0) body.dataset.fillReady = "1"; }));
  else if (Math.abs(v - lastFill) > .02) { body.dataset.fillJump = "1"; clearTimeout(fillJump); fillJump = window.setTimeout(() => delete body.dataset.fillJump, 1700); }
  lastFill = v;
  body.style.setProperty("--fill", String(v));
}

/** Repaints the floating timer after a theme change. */
export const rethemeFloat = () => renderFloating(lastTxt, lastFrac);

export function renderTaskStarts(force = false) {
  if (ui.list?.dragging()) return;
  if (renderedDay !== todayKey()) { renderTasks(); return; }
  const minute = Math.floor(Date.now() / MIN);
  if (!force && minute === startEstimateMinute) return;
  startEstimateMinute = minute;
  list.setPlan(withBest(taskStartPlan()));
}

export function renderTasks() {
  if (ui.list?.dragging()) return;
  renderedDay = todayKey();
  syncActive();
  const projects = projectNames(viewTasks());
  Labels.importTasks(S.tasks);
  if (S.projectFilter.startsWith("project:") && !projects.includes(S.projectFilter.slice(8))) S.projectFilter = "";
  if (!projects.length) S.projectFilter = "";
  list.refresh();
  renderTaskStarts(true);
  flushSync();
  if (!labelPop.hidden) {
    const a = ui.label?.anchor();
    if (a) { if (LP.key !== "hash") a.setAttribute("aria-expanded", "true"); ui.label?.place(); } else closeLabelPop();
  }
}

export const renderStats = () => progress.refresh();
export const renderPill = () => pill.refresh();
export const renderEstPick = () => composer.refresh();
export function renderAll() { renderPill(); renderTasks(); renderStats(); renderEstPick(); renderTimer(true); }
