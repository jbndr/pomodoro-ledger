import { calm } from "../dom";

export interface GridOpts {
  n: number;
  cols: number;
  kind: "dot" | "tick";
  /** Gap and the largest cell, from the story card's width and height. */
  gap: (w: number, h: number) => number;
  cap?: (w: number, h: number) => number;
  delay?: number;
}

const DUR = 460, SPREAD = 640;
const back = (t: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Pops a grid of dots or ticked tiles into a canvas: one layer instead of one per cell. */
export function grid(cv: HTMLCanvasElement, o: GridOpts) {
  const c = cv.getContext("2d")!;
  const card = cv.closest<HTMLElement>(".yr-card")!;
  let t0 = performance.now() + (o.delay ?? 520), raf = 0, cell = 0, gap = 0;
  const step = Math.min(o.kind === "dot" ? 9 : 28, SPREAD / Math.max(1, o.n));

  function size() {
    const w = cv.clientWidth, cw = card.clientWidth, ch = card.clientHeight, dpr = devicePixelRatio || 1;
    gap = o.gap(cw, ch);
    cell = Math.min((w - gap * (o.cols - 1)) / o.cols, o.cap ? o.cap(cw, ch) : Infinity);
    const rows = Math.ceil(o.n / o.cols), h = rows * cell + (rows - 1) * gap;
    cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now: number) {
    const cs = getComputedStyle(cv), ink = cs.color, tile = cs.getPropertyValue("--leaf").trim(), mark = cs.getPropertyValue("--surface").trim();
    c.clearRect(0, 0, cv.width, cv.height);
    let done = true;
    for (let k = 0; k < o.n; k++) {
      const p = Math.max(0, Math.min(1, (now - t0 - k * step) / DUR));
      if (p < 1) done = false;
      if (!p) continue;
      const s = Math.max(0, back(p)), x = (k % o.cols) * (cell + gap), y = Math.floor(k / o.cols) * (cell + gap), r = (cell / 2) * s;
      c.globalAlpha = Math.min(1, p * 2.5);
      c.save();
      c.translate(x + cell / 2, y + cell / 2);
      if (o.kind === "dot") {
        c.fillStyle = ink; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = tile; c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, r * 0.56); c.fill();
        const u = (cell * s) / 16;
        c.strokeStyle = mark; c.lineWidth = 2.4 * u; c.lineCap = "round"; c.lineJoin = "round";
        c.beginPath(); c.moveTo(-3.5 * u, 0.4 * u); c.lineTo(-1.2 * u, 2.7 * u); c.lineTo(3.5 * u, -2.5 * u); c.stroke();
      }
      c.restore();
    }
    c.globalAlpha = 1;
    return done;
  }

  const loop = (now: number) => { if (!draw(now)) raf = requestAnimationFrame(loop); };
  size();
  if (calm()) t0 = -Infinity;
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => { size(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
  ro.observe(cv);
  return { destroy() { cancelAnimationFrame(raf); ro.disconnect(); } };
}
