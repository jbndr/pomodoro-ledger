import { phone, showPage } from "./pages";
import { timerView } from "./timer/state.svelte";

/** "Zen" is the timer filling the page; with the browser's full screen on top when asked for. */
export function setZen(on: boolean) {
  document.body.classList.toggle("zen", on);
  document.querySelectorAll<HTMLElement>(".bar, .room, .banner, .panel, .progress, .tabbar").forEach((el) => (el.inert = on));
  timerView.zen = on;
}

export const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;

function browserFull(on: boolean) {
  const root = document.documentElement;
  try {
    const fn = on ? root.requestFullscreen || root.webkitRequestFullscreen : document.exitFullscreen || document.webkitExitFullscreen;
    const p = fn && fn.call(on ? root : document);
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

export function toggleZen(native?: boolean) {
  if (phone() && document.body.dataset.page !== "timer") showPage("timer");
  const on = native ? !fsEl() : !document.body.classList.contains("zen");
  setZen(on);
  if (fsEl() ? !on : on && native) browserFull(on);
}
