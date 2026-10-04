import { calm } from "../dom";

const PROPS = ["--rx", "--ry", "--px", "--py", "--gx", "--gy"];

/** Lights a medal's foil and tilts it towards a point given in page coordinates. */
export function light(el: HTMLElement, cx: number, cy: number, tilt = 26) {
  if (calm()) return;
  const r = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (cx - r.left) / r.width)), y = Math.max(0, Math.min(1, (cy - r.top) / r.height));
  el.style.setProperty("--rx", ((0.5 - y) * tilt).toFixed(2) + "deg");
  el.style.setProperty("--ry", ((x - 0.5) * tilt).toFixed(2) + "deg");
  el.style.setProperty("--px", (x * 100).toFixed(1) + "%");
  el.style.setProperty("--py", (y * 100).toFixed(1) + "%");
  el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
  el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
  el.classList.add("on");
}

export function dim(el: HTMLElement) {
  for (const p of PROPS) el.style.removeProperty(p);
  el.classList.remove("on");
}
