import { timerMessage } from "./lib/extension";
import { S, T } from "./state";

let last = "";

/** Tells the site blocker extension, if installed, about the timer. */
export function announce() {
  const t = S.activeId ? S.tasks.get(S.activeId) : undefined;
  const m = timerMessage(T, t && !t.done ? t.title : null), key = JSON.stringify(m);
  if (key === last) return;
  last = key;
  try { window.postMessage(m, location.origin); } catch {}
}

export const extensionVersion = () => document.documentElement.dataset.plExtension || "";
