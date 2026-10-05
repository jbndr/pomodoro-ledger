import { toast } from "./chrome/notice.svelte";
import { $ } from "./dom";
import { fmtClock } from "./format";
import { ICON } from "./icons";
import { MIN } from "./lib/dates";
import { MODE_NAME } from "./lib/timer";
import { S, T } from "./state";
import { adjust, flushPartial, MAX_RUN, remNow, setMode, skip, tick, toggle, totalNow } from "./timer/engine";

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

export function renderFloating(txt: string, frac: number) {
  if (!floatWindow || floatWindow.closed) return;
  const doc = floatWindow.document, root = doc.documentElement;
  const theme = getComputedStyle(document.body);
  for (const name of ["--bg", "--surface", "--surface-2", "--fg", "--muted", "--faint", "--line", "--line-2", "--tomato", "--on-accent", "--shadow", "--glow-o", "--f-display", "--f-body", "--f-mono"]) {
    root.style.setProperty(name, theme.getPropertyValue(name));
  }
  root.style.setProperty("--accent", theme.getPropertyValue(T.mode === "short" ? "--leaf" : T.mode === "long" ? "--sky" : "--tomato"));
  root.style.colorScheme = getComputedStyle(document.documentElement).colorScheme;
  doc.title = txt + " · " + MODE_NAME[T.mode];
  const every = S.settings.longEvery, idx = Math.min(T.setIndex || 0, every);
  $("#miniMode", doc).textContent = MODE_NAME[T.mode] + (T.mode === "focus" ? " · " + Math.min(idx + 1, every) + " of " + every : "");
  const time = $("#miniTime", doc);
  time.innerHTML = [...txt].map((c) => (c === ":" ? '<span class="c">:</span>' : '<span class="d">' + c + "</span>")).join("");
  const secs = Math.ceil(remNow() / 1000);
  time.setAttribute("aria-label", Math.floor(secs / 60) + " minutes " + (secs % 60) + " seconds remaining");
  $("#miniSub", doc).textContent = T.status === "running" ? "ends at " + fmtClock(T.endsAt) : T.status === "paused" ? "paused" : (totalNow() / MIN) + " min";
  const task = S.activeId && S.tasks.get(S.activeId);
  const taskEl = $("#miniTask", doc);
  taskEl.textContent = task ? task.title : T.mode === "focus" ? "Time to focus" : "Take a breather";
  taskEl.title = task ? task.title : "";
  $("#miniProgress", doc).style.width = (frac * 100) + "%";
  const [less, more] = doc.querySelectorAll<HTMLButtonElement>(".step button");
  less.disabled = remNow() < 2 * MIN;
  more.disabled = totalNow() + MIN > MAX_RUN;
  const button = $("#miniToggle", doc);
  const label = T.status === "running" ? "Pause" : T.status === "paused" ? "Resume" : "Start";
  if (button.getAttribute("aria-label") !== label) {
    button.innerHTML = (T.status === "running" ? ICON.pause : ICON.play) + label;
    button.setAttribute("aria-label", label);
  }
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
    opened = await window.documentPictureInPicture!.requestWindow({ width: 300, height: 184 });
    const doc = opened.document;
    const fontLink = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
    if (fontLink) doc.head.appendChild(fontLink.cloneNode());
    const style = doc.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg); }
      body { padding: 6px; font: 13px/1.4 var(--f-body); -webkit-font-smoothing: antialiased; }
      main { position: relative; isolation: isolate; width: 100%; height: 100%; min-height: 0; overflow: hidden; padding: 10px 12px 11px; display: grid; grid-template-rows: auto auto 6px auto 36px; gap: 6px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: var(--shadow); }
      .glow { position: absolute; z-index: -1; width: 280px; aspect-ratio: 1; left: 25%; top: 35%; translate: -50% -50%; border-radius: 50%; background: var(--accent); opacity: var(--glow-o); filter: blur(56px); pointer-events: none; }
      .meta { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      #miniMode { overflow: hidden; color: var(--accent); font-size: 9.5px; font-weight: 650; letter-spacing: .1em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
      #miniSub { flex: none; color: var(--muted); font: 9.5px/1.2 var(--f-body); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .time-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .step { display: flex; gap: 4px; opacity: .55; transition: opacity .15s; }
      main:hover .step, .step:focus-within { opacity: 1; }
      .step button { width: 30px; height: 26px; border-radius: 999px; font: 550 11px var(--f-body); font-variant-numeric: tabular-nums; }
      .step button:disabled { opacity: .35; cursor: default; transform: none; }
      .step button:disabled:hover { background: var(--surface-2); color: var(--muted); }
      #miniTime { font: 650 clamp(42px, 17vw, 52px)/.9 var(--f-display); letter-spacing: -.02em; font-variation-settings: "opsz" 96; font-variant-numeric: tabular-nums; white-space: nowrap; }
      #miniTime .d { display: inline-block; width: .6em; text-align: center; }
      #miniTime .c { display: inline-block; width: .28em; text-align: center; translate: 0 -.06em; }
      .progress { overflow: hidden; height: 6px; border-radius: 999px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
      #miniProgress { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .25s linear, background .8s; }
      .task { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
      .task-label { flex: none; color: var(--faint); font-size: 8.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; }
      #miniTask { min-width: 0; overflow: hidden; color: var(--fg); font-family: var(--f-display); font-size: 12.5px; font-weight: 650; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
      .actions { display: grid; grid-template-columns: 36px minmax(92px, 1fr) 36px; align-items: center; gap: 8px; }
      button { height: 36px; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 550 12.5px var(--f-body); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: background .15s, color .15s, transform .1s; }
      .round { border-radius: 50%; }
      button:hover { background: var(--surface); color: var(--fg); }
      button:active { transform: scale(.96); }
      button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      button svg { width: 16px; height: 16px; }
      #miniToggle { border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-family: var(--f-display); font-size: 13.5px; font-weight: 700; box-shadow: 0 8px 18px -10px var(--accent); }
      #miniToggle:hover { background: var(--accent); color: var(--on-accent); filter: brightness(.96); }
      @media (max-height: 175px) {
        body { padding: 4px; }
        main { padding: 7px 10px 8px; grid-template-rows: auto auto 5px auto 32px; gap: 4px; border-radius: 17px; }
        #miniTime { font-size: clamp(36px, 15vw, 46px); }
        .actions { grid-template-columns: 32px minmax(80px, 1fr) 32px; gap: 7px; }
        button { height: 32px; }
      }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `;
    doc.head.appendChild(style);
    doc.body.innerHTML = '<main aria-label="Floating Pomodoro timer"><div class="glow" aria-hidden="true"></div><div class="meta"><div id="miniMode"></div><div id="miniSub"></div></div><div class="time-row"><div id="miniTime" role="timer" aria-label="Time remaining"></div><div class="step" role="group" aria-label="Adjust this session"><button type="button" data-adj="-1" aria-label="1 minute less" title="1 minute less (−)">−1</button><button type="button" data-adj="1" aria-label="1 minute more" title="1 minute more (+)">+1</button></div></div><div class="progress" aria-hidden="true"><i id="miniProgress"></i></div><div class="task"><span class="task-label">Working on</span><span id="miniTask"></span></div><div class="actions"><button class="round" id="miniReset" type="button" aria-label="Reset timer" title="Reset timer">' + ICON.undo + '</button><button id="miniToggle" type="button"></button><button class="round" id="miniSkip" type="button" aria-label="Skip to next phase" title="Skip to next phase">' + $("#skipBtn").innerHTML + '</button></div></main>';
    $("#miniToggle", doc).addEventListener("click", toggle);
    $("#miniReset", doc).addEventListener("click", () => { flushPartial(); setMode(T.mode); });
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
