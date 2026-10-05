import { tick } from "svelte";
import { calm } from "../dom";
import { phaseMorph, type PhaseMorph } from "../lib/phaseMorph";
import { S } from "../state";

const SNAPSHOT: PhaseMorph[] = ["wipe", "clock"], DRIVEN: PhaseMorph[] = ["blend", "grey"];
const ACC = ["--acc-l", "--acc-c", "--acc-h"];

const ease = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lch = () => { const cs = getComputedStyle(document.body); return ACC.map((p) => parseFloat(cs.getPropertyValue(p))); };

function drive(ms: number, at: (t: number) => number[]) {
  const s = document.body.style, t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), [l, c, h] = at(t);
    s.setProperty("--acc-l", l + "%"); s.setProperty("--acc-c", String(c)); s.setProperty("--acc-h", String(h));
    if (t < 1) requestAnimationFrame(step);
    else for (const p of ACC) s.removeProperty(p);
  };
  requestAnimationFrame(step);
}

let settle = 0;

/** Applies a phase change (the body's data-mode) with the chosen colour transition. */
export function changeMode(apply: () => void, kind: PhaseMorph = phaseMorph(S.settings.phaseMorph)) {
  const b = document.body;
  if (calm()) kind = "instant";
  b.classList.toggle("morph-instant", kind !== "sweep" && !DRIVEN.includes(kind));
  b.classList.toggle("morph-js", DRIVEN.includes(kind));
  b.classList.add("morphing");
  clearTimeout(settle);
  settle = window.setTimeout(() => b.classList.remove("morphing"), 800);

  if (DRIVEN.includes(kind)) {
    for (const p of ACC) b.style.removeProperty(p);
    const from = lch();
    apply();
    const to = lch();
    if (kind === "blend") {
      const lab = ([l, c, h]: number[]) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
      const x = lab(from), y = lab(to);
      drive(260, (t) => { const k = ease(t), a = lerp(x[1], y[1], k), bb = lerp(x[2], y[2], k); return [lerp(x[0], y[0], k), Math.hypot(a, bb), (Math.atan2(bb, a) * 180) / Math.PI]; });
    } else {
      drive(420, (t) => { const k = ease(t), l = lerp(from[0], to[0], k); return t < .5 ? [l, from[1] * (1 - k * 2) + .012, from[2]] : [l, to[1] * (k * 2 - 1) + .012, to[2]]; });
    }
    return;
  }

  const card = document.querySelector<HTMLElement>(".timer-card");
  if (SNAPSHOT.includes(kind) && card && document.startViewTransition && card.offsetParent) {
    const dial = card.querySelector(".dial")?.getBoundingClientRect(), r = card.getBoundingClientRect(), root = document.documentElement;
    if (dial) {
      root.style.setProperty("--morph-x", ((dial.left + dial.width / 2 - r.left) / r.width) * 100 + "%");
      root.style.setProperty("--morph-y", ((dial.top + dial.height / 2 - r.top) / r.height) * 100 + "%");
    }
    root.classList.add("morph-" + kind);
    card.style.viewTransitionName = "timer-card";
    const vt = document.startViewTransition(async () => { apply(); await tick(); });
    vt.finished.finally(() => { root.classList.remove("morph-" + kind); card.style.viewTransitionName = ""; });
    return;
  }

  apply();
  if (kind === "instant" && !calm()) for (const el of document.querySelectorAll(".timer-card .dial, .timer-card .go")) el.animate([{ scale: 1 }, { scale: .965, offset: .35 }, { scale: 1 }], { duration: 320, easing: "ease-out" });
}
