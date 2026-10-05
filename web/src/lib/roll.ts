import { calm } from "../dom";

const EASE = "cubic-bezier(.32, .72, 0, 1)";
const numberIn = (s: string) => parseFloat(s.replace(/[^\d.]/g, "")) || 0;

/** Rolls an element's text in when its number changes after the first render: up when it grows, down when it shrinks. */
export function roll(node: HTMLElement) {
  let last = node.textContent || "";
  const mo = new MutationObserver(() => {
    const now = node.textContent || "";
    if (now === last) return;
    const up = numberIn(now) >= numberIn(last);
    last = now;
    if (calm()) return;
    node.animate([{ transform: `translateY(${up ? "45%" : "-45%"})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: EASE });
  });
  mo.observe(node, { subtree: true, characterData: true, childList: true });
  return () => mo.disconnect();
}

/** Rolls the digits that changed, for jumps rather than ordinary ticks. */
export function rollDigits(spans: HTMLElement[], before: string[], after: string[], up: boolean) {
  if (calm()) return;
  after.forEach((c, i) => {
    if (c === before[i] || !/\d/.test(c) || !spans[i]) return;
    for (const a of spans[i].getAnimations()) a.cancel();
    spans[i].animate([{ transform: `translateY(${up ? "38%" : "-38%"})`, opacity: 0, filter: "blur(2px)" }, { transform: "none", opacity: 1, filter: "blur(0)" }], { duration: 300, delay: (after.length - 1 - i) * 18, easing: EASE, fill: "backwards" });
  });
}
