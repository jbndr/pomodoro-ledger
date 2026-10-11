import { mount, unmount } from "svelte";
import { toast } from "./chrome/notice.svelte";
import { $ } from "./dom";
import { fmtClock } from "./format";
import { ICON } from "./icons";
import { MIN } from "./lib/dates";
import { timerFace, timerRing } from "./lib/faces";
import { MODE_NAME } from "./lib/timer";
import { S, T } from "./state";
import { adjust, MAX_RUN, remNow, skip, tick, toggle, totalNow, upNow } from "./timer/engine";
import FaceDigits from "./timer/FaceDigits.svelte";
import FloatBar from "./timer/FloatBar.svelte";
import facesCss from "./timer/faces/faces.css?inline";
import { floatView } from "./timer/state.svelte";

// A second view of the same timer: no separate state, logs, or room connection.
let floatWindow: Window | null = null, floatOpening = false;
export const floatBtn = $<HTMLButtonElement>("#floatBtn");
const isOpen = () => !!floatWindow && !floatWindow.closed;

export function initFloat() {
  floatBtn.hidden = !window.documentPictureInPicture || !window.isSecureContext;
  floatBtn.addEventListener("click", () => {
    if (isOpen()) floatWindow!.close();
    else openFloating();
  });
  autoFloatHandler();
}

let lastState = "", lastNudge = "";

const TOKENS = ["--bg", "--surface", "--surface-2", "--fg", "--muted", "--faint", "--line", "--line-2", "--accent", "--acc-l", "--acc-c", "--acc-h", "--glow-o", "--ember", "--paper", "--grain-o", "--go-l-max", "--f-display", "--f-body",
  "--fl-top-a", "--fl-top-b", "--fl-bot-a", "--fl-bot-b", "--fl-ink", "--fl-slit", "--fl-colon", "--fl-lift", "--fl-off", "--fl-edge", "--fl-gap", "--mx-off", "--face-glow", "--nx-dot", "--pp-a", "--pp-b", "--pp-edge",
  "--lcd-a", "--lcd-b", "--mesh-l", "--mesh-c", "--wash-l", "--ht-ink", "--ht-mask", "--page-acc-l", "--page-acc-c", "--f-serif", "--f-mono", "--f-round", "--wt-a", "--wt-b", "--wt-back", "--fill",
  "--wx-tex-near", "--wx-rain-far", "--wx-snow-near", "--wx-cover", "--wx-amount", "--wx-slant", "--sun-x", "--sun-y"];

export function renderFloating(txt: string, frac: number) {
  if (!floatWindow || floatWindow.closed) return;
  const doc = floatWindow.document, root = doc.documentElement, main = $("main", doc);
  // Read from the card: a dark background gives it dark tokens even in light mode.
  const theme = getComputedStyle(document.querySelector(".timer-card") || document.body);
  for (const name of TOKENS) { const v = theme.getPropertyValue(name); if (root.style.getPropertyValue(name) !== v) root.style.setProperty(name, v); }
  root.style.colorScheme = theme.colorScheme;
  for (const k of ["backdrop", "status", "fillJump", "fillReady"]) { const v = document.body.dataset[k] || ""; if (doc.body.dataset[k] !== v) doc.body.dataset[k] = v; }
  for (const k of ["sky", "wx"]) { const v = document.documentElement.dataset[k] || ""; if (root.dataset[k] !== v) root.dataset[k] = v; }
  const flow = T.upKind === "flow" || !!T.flowReady, over = !!T.up && !flow;
  doc.title = txt + " · " + (flow ? "Flow" : MODE_NAME[T.mode]);

  // A phase that just ended gets one small pop.
  const state = (flow ? "flow" : T.mode) + ":" + T.status + (over ? ":over" : "");
  if (state !== lastState) {
    const [mode, status] = lastState.split(":");
    if (status === "running" && T.status === "idle" && mode !== T.mode) replay(main, "bell");
    if (lastState) replay($("#miniTask", doc), "swap");
    lastState = state;
  }
  main.classList.toggle("paused", T.status === "paused");
  main.classList.toggle("over", over);

  const time = $("#miniTime", doc), face = timerFace(S.settings.face);
  floatView.face = face; floatView.ring = timerRing(S.settings.ring); floatView.chars = [...txt]; floatView.frac = flow ? 1 : frac;
  floatView.mode = T.mode; floatView.up = flow ? "flow" : over ? "over" : "";
  const secs = T.up ? Math.floor(upNow() / 1000) : Math.ceil(remNow() / 1000);
  time.setAttribute("aria-label", Math.floor(secs / 60) + " minutes " + (secs % 60) + (T.up ? (flow ? " seconds of flow" : " seconds past the bell") : " seconds remaining"));

  const task = S.activeId && S.tasks.get(S.activeId);
  const taskEl = $("#miniTask", doc);
  // A break's nudge takes the line, since this window is what stays in view.
  const nudge = T.mode !== "focus" && !flow && !over && T.nudge && !T.nudge.done ? T.nudge.text : "";
  if (nudge !== lastNudge) { if (lastState && nudge) replay(taskEl, "swap"); lastNudge = nudge; }
  taskEl.textContent = nudge || (task ? task.title : T.mode === "focus" ? "Time to focus" : "Take a breather");
  taskEl.classList.toggle("none", !task && !nudge);
  taskEl.classList.toggle("nudge", !!nudge);
  taskEl.title = nudge || (task ? task.title : "");

  const [less, more] = doc.querySelectorAll<HTMLButtonElement>("[data-adj]");
  less.disabled = !!T.up || remNow() < 2 * MIN;
  more.disabled = !!T.up || totalNow() + MIN > MAX_RUN;
  const button = $("#miniToggle", doc);
  const label = T.status === "running" ? "Pause" : T.status === "paused" ? "Resume" : "Start";
  if (button.getAttribute("aria-label") !== label) {
    button.innerHTML = T.status === "running" ? ICON.pause : ICON.play;
    button.setAttribute("aria-label", label);
    button.title = label + " (Space)";
  }
}

function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function autoFloatHandler() {
  if (!navigator.mediaSession) return;
  try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, S.settings.autoFloat && !floatBtn.hidden ? () => openFloating(true) : null); } catch {}
}

export function autoFloat() {
  if (S.settings.autoFloat && !floatBtn.hidden && navigator.userActivation?.isActive && !isOpen()) openFloating(true);
}

async function openFloating(quiet?: boolean) {
  if (floatOpening || isOpen()) return;
  floatOpening = true;
  let opened: Window | null = null;
  try {
    opened = await window.documentPictureInPicture!.requestWindow({ width: 320, height: 110 });
    const doc = opened.document;
    for (const link of document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')) doc.head.appendChild(link.cloneNode());
    const style = doc.createElement("style");
    style.textContent = facesCss + `
      * { box-sizing: border-box; }
      html { font-size: min(.9091vh, .3125vw); }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--surface); color: var(--fg); }
      body { font: 13rem/1.35 var(--f-body); -webkit-font-smoothing: antialiased; }
      main { position: relative; isolation: isolate; height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 1fr auto; column-gap: 12rem; padding: 14rem 16rem 15rem; }
      .glow { position: absolute; z-index: -1; inset: 0; pointer-events: none;
        background:
          linear-gradient(180deg, oklch(calc(var(--acc-l) + 33%) calc(var(--acc-c) * .3) var(--acc-h) / var(--paper)), transparent 75%),
          radial-gradient(70% 90% at 0% 0%, oklch(var(--acc-l) var(--acc-c) var(--acc-h) / calc(var(--glow-o) * 1.1 * var(--ember))), transparent 72%);
        transition: opacity .6s; }
      .glow::after { content: ""; position: absolute; inset: 0; opacity: var(--grain-o); mix-blend-mode: overlay; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
      main.paused .glow { opacity: .4; }
      .body { align-self: center; min-width: 0; display: grid; gap: 5rem; }
      #miniTime { font: 650 46rem/.95 var(--f-display); letter-spacing: -.02em; font-variation-settings: "opsz" 96; font-variant-numeric: tabular-nums; white-space: nowrap; transform-origin: left center; transition: opacity .3s, color .3s; }
      #miniTime .d { display: inline-block; width: .6em; text-align: center; }
      #miniTime .p { display: inline-block; width: .42em; text-align: center; }
      #miniTime .c { display: inline-block; width: .28em; text-align: center; translate: 0 -.06em; }
      main.paused #miniTime { opacity: .5; }
      main.over #miniTime { color: oklch(min(var(--acc-l), var(--go-l-max)) var(--acc-c) var(--acc-h)); }
      .line { display: grid; min-width: 0; height: 24rem; }
      .line > * { grid-area: 1 / 1; min-width: 0; align-self: center; transition: opacity .18s, translate .18s; }
      #miniTask { overflow: hidden; font-size: 14rem; font-weight: 600; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
      #miniTask.none { color: var(--muted); font-weight: 500; }
      #miniTask.nudge { color: oklch(min(var(--acc-l), var(--go-l-max)) var(--acc-c) var(--acc-h)); }
      #miniTask.swap { animation: swap .32s cubic-bezier(.32, .72, 0, 1); }
      @keyframes swap { from { opacity: 0; filter: blur(2px); translate: 0 3rem; } }
      .step { display: flex; gap: 4rem; opacity: 0; translate: 0 3rem; pointer-events: none; }
      main:hover .step, .step:focus-within { opacity: 1; translate: 0 0; pointer-events: auto; }
      main:hover #miniTask, main:has(.step:focus-within) #miniTask { opacity: 0; translate: 0 -3rem; }
      button { border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background-color .2s, color .15s, transform .1s; }
      button:not(:disabled):active { transform: scale(.95); }
      button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .step button { height: 26rem; min-width: 32rem; padding: 0 9rem; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12rem; font-weight: 550; font-variant-numeric: tabular-nums; }
      .step button:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); }
      .step button:disabled { opacity: .4; cursor: default; }
      .step svg { width: 13rem; height: 13rem; }
      #miniToggle { align-self: center; width: 52rem; height: 52rem; border-radius: 50%;
        color: oklch(min(var(--acc-l), var(--go-l-max)) var(--acc-c) var(--acc-h)); background: color-mix(in oklab, var(--accent) 15%, var(--surface)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 22%, transparent); }
      #miniToggle:hover { background: color-mix(in oklab, var(--accent) 21%, var(--surface)); }
      #miniToggle svg { width: 19rem; height: 19rem; }
      .bar { grid-column: 1 / -1; margin-top: 12rem; height: 3rem; overflow: hidden; border-radius: 999px; background: color-mix(in oklab, var(--accent) 14%, var(--surface-2)); }
      #miniBar { display: block; height: 100%; border-radius: inherit; background: var(--accent); transform-origin: left; transition: scale .25s linear; }
      #miniTime .face-flap, #miniTime .face-nixie { font-size: 38rem; vertical-align: middle; }
      #miniTime .face-matrix { display: inline-block; width: auto; height: 32rem; vertical-align: middle; }
      /* The page's own phase colour is copied onto the root; re-deriving it here would pick up the card's tint. */
      body { --page-acc-l: inherit; --page-acc-c: inherit; }
      /* Mirrored, the dots gather behind the button rather than under the task. */
      [data-backdrop="halftone"] main > .glow::before { transform: scaleX(-1); -webkit-mask-size: 300rem 300rem; mask-size: 300rem 300rem; }
      #miniTime :is(.face-seg, .face-odo) { font-size: 30rem; }
      #miniTime .face-lcd { padding-top: .2em; }
      #miniTime .face-lcd small { display: none; }
      #miniTime .face-serif { font-size: 50rem; vertical-align: middle; }
      #miniTime .face-words { display: grid; justify-items: start; text-align: left; gap: 1rem; }
      #miniTime .face-words b { font-size: 25rem; line-height: 1; }
      #miniTime .face-words span { font-size: 11.5rem; line-height: 1.15; }
      #miniTime .face-stack { font-size: 26rem; justify-items: start; }
      .bar[data-ring="tiles"], .bar[data-ring="dots"] { height: 9rem; display: flex; align-items: center; justify-content: space-between; gap: 2rem; overflow: visible; background: none; border-radius: 0; }
      .bar .t { position: relative; flex: 1; height: 9rem; border-radius: 1.5rem; background: var(--fl-off); box-shadow: inset 0 0 0 .5px var(--fl-edge); transition: background-color .3s; }
      .bar .t::after { content: ""; position: absolute; left: 0; right: 0; top: calc(50% - .5px); height: 1px; background: var(--fl-gap); }
      .bar .t.lit { background: var(--accent); box-shadow: none; }
      .bar .o { width: 5rem; height: 5rem; border-radius: 50%; background: var(--mx-off); transition: background-color .3s, scale .3s; }
      .bar .o.lit { background: var(--accent); }
      .bar .o.lead { scale: 1.35; box-shadow: 0 0 4rem var(--accent); }
      .bar[data-ring="glow"] { height: 5rem; overflow: visible; padding: 1.5rem; background: color-mix(in oklab, var(--fg) 6%, transparent); }
      .bar[data-ring="glow"] #miniBar { background: color-mix(in oklab, var(--accent), #fff calc(var(--face-glow) * 50%)); box-shadow: 0 0 3rem var(--accent), 0 0 8rem color-mix(in oklab, var(--accent) 60%, transparent); }
      main.bell #miniTime { animation: pop .6s cubic-bezier(.34, 1.56, .64, 1); }
      main.bell .glow, [data-backdrop] main.bell .glow { animation: glow 2.2s ease; }
      @keyframes pop { 40% { scale: 1.05; } }
      @keyframes glow { 15% { opacity: 1; filter: saturate(1.6) brightness(1.04); } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `;
    doc.head.appendChild(style);
    doc.body.innerHTML = '<main aria-label="Floating Pomodoro timer"><div class="glow" aria-hidden="true"></div>'
      + '<div class="body"><div id="miniTime" role="timer" aria-label="Time remaining"></div><div class="line"><div id="miniTask"></div>'
      + '<div class="step" role="group" aria-label="Adjust this session"><button type="button" data-adj="-1" aria-label="1 minute less" title="1 minute less (−)">−1</button><button type="button" data-adj="1" aria-label="1 minute more" title="1 minute more (+)">+1</button><button type="button" id="miniSkip" aria-label="Skip to next phase" title="Skip to next phase">' + $("#skipBtn").innerHTML + "</button></div></div></div>"
      + '<button id="miniToggle" type="button"></button>'
      + "</main>";
    const faceParts = [mount(FaceDigits, { target: $("#miniTime", doc), props: floatView }), mount(FloatBar, { target: $("main", doc), props: floatView })];
    lastState = "";
    $("#miniToggle", doc).addEventListener("click", toggle);
    $("#miniSkip", doc).addEventListener("click", skip);
    $(".step", doc).addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-adj]"); if (b) adjust(+b.dataset.adj!); });
    doc.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space" && e.target === doc.body && !e.repeat) { e.preventDefault(); toggle(); }
      else if (e.key === "+" || e.key === "=") adjust(1);
      else if (e.key === "-") adjust(-1);
    });
    floatWindow = opened;
    // Keep the visible mini clock fresh even when the main tab is in the background.
    const interval = opened.setInterval(tick, 250);
    const win = opened;
    win.addEventListener("pagehide", () => {
      win.clearInterval(interval);
      for (const part of faceParts) unmount(part);
      if (floatWindow !== win) return;
      floatWindow = null;
      floatBtn.setAttribute("aria-pressed", "false");
      floatBtn.setAttribute("aria-label", "Open floating timer");
      floatBtn.title = "Open floating timer";
    }, { once: true });
    floatBtn.setAttribute("aria-pressed", "true");
    floatBtn.setAttribute("aria-label", "Close floating timer");
    floatBtn.title = "Close floating timer";
    tick();
  } catch {
    if (opened) opened.close();
    if (!quiet) toast("Couldn't open the floating timer. Try again from a supported desktop browser.");
  } finally { floatOpening = false; }
}
