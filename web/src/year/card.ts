import { addDays, dayKey } from "../lib/dates";
import type { WeekRecap } from "../lib/insights";
import { heatLevel } from "../lib/stats";
import { labelHue } from "../lib/tasks";
import type { Badge, YearStats } from "../lib/year";
import { emblem, HUE, type Ink } from "./emblems";

export interface Fmt {
  fmtDur(ms: number): string;
  fmtDate(t: number, o?: Intl.DateTimeFormatOptions): string;
}

type Ctx = CanvasRenderingContext2D;

const DISPLAY = "'Bricolage Grotesque', Geist, system-ui, sans-serif", BODY = "Geist, system-ui, sans-serif";
const font = (c: Ctx, w: number, px: number, fam = BODY) => { c.font = `${w} ${px}px ${fam}`; };

function tokens() {
  const cs = getComputedStyle(document.body), v = (n: string) => cs.getPropertyValue("--" + n).trim();
  return {
    bg: v("bg"), surface: v("surface"), surface2: v("surface-2"), line: v("line"), fg: v("fg"), muted: v("muted"), faint: v("faint"),
    tomato: v("tomato"), leaf: v("leaf"), sky: v("sky"), warn: v("warn"), on: v("on-accent"),
    heat: [0, 1, 2, 3, 4].map((i) => v("heat" + i)),
  };
}
type Tok = ReturnType<typeof tokens>;

const rgb = (h: string) => { const n = parseInt(h.replace("#", "").slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/** `a` mixed into `b` by `t`. */
export const mix = (a: string, b: string, t: number) => "#" + rgb(a).map((x, i) => Math.round(x * t + rgb(b)[i] * (1 - t)).toString(16).padStart(2, "0")).join("");

async function ready() {
  if (!document.fonts) return;
  await Promise.all(["800 100px 'Bricolage Grotesque'", "650 100px 'Bricolage Grotesque'", "400 40px Geist", "600 40px Geist"].map((f) => document.fonts.load(f).catch(() => null)));
}

function canvas(w: number, h: number, bg: string): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d")!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.textBaseline = "alphabetic";
  return [cv, c];
}

const blob = (cv: HTMLCanvasElement) => new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("No image"))), "image/png"));

function round(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); c.fillStyle = fill; c.fill();
}

function text(c: Ctx, s: string, x: number, y: number, color: string, opts: { align?: CanvasTextAlign; max?: number; track?: number } = {}) {
  c.fillStyle = color; c.textAlign = opts.align || "left";
  if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = (opts.track || 0) + "px";
  let t = s;
  if (opts.max) while (t.length > 1 && c.measureText(t).width > opts.max) t = t.slice(0, -2) + "…";
  c.fillText(t, x, y);
  if ("letterSpacing" in c) (c as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}

/** The Dot Tick mark, `s` pixels square. */
function mark(c: Ctx, x: number, y: number, s: number, dot: string, tick: string) {
  const k = s / 28;
  c.fillStyle = dot; c.beginPath(); c.arc(x + 5.6 * k, y + 14 * k, 4.5 * k, 0, Math.PI * 2); c.fill();
  c.strokeStyle = tick; c.lineWidth = 6 * k; c.lineCap = "round";
  c.beginPath(); c.moveTo(x + 13.04 * k, y + 20.96 * k); c.lineTo(x + 22.16 * k, y + 7.76 * k); c.stroke();
}

const img = (svg: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });

function inkFor(t: Tok, b: Badge, bg: string, fg: string): Ink {
  const tint = mix(t[HUE[b.id]], t.surface, 0.17);
  return { tomato: t.tomato, leaf: t.leaf, sky: t.sky, warn: t.warn, fg: b.earned ? t.fg : fg, face: b.earned ? tint : bg, tint };
}

/** Draws emblems on a background `bg`; locked ones take the colour `fg`. */
async function emblems(c: Ctx, t: Tok, list: Badge[], bg: string, fg: string, at: (i: number) => [number, number, number]) {
  const imgs = await Promise.all(list.map((b) => img(emblem(b.id, inkFor(t, b, bg, fg), !b.earned, true))));
  imgs.forEach((im, i) => { const [x, y, s] = at(i); c.drawImage(im, x, y, s, s); });
}

function brand(c: Ctx, t: Tok, x: number, y: number, fg: string, chip: string) {
  round(c, x, y, 88, 88, 26, chip);
  mark(c, x + 14, y + 14, 60, t.tomato, t.leaf);
  font(c, 650, 40, DISPLAY);
  text(c, "Pomodoro Ledger", x + 112, y + 58, fg);
}

const hours = (ms: number) => { const h = ms / 3600000; return h >= 10 ? Math.round(h).toLocaleString() : h >= 1 ? h.toFixed(1) : String(Math.round(ms / 60000)); };
export const hoursUnit = (ms: number) => (ms >= 3600000 ? (ms >= 3600000 * 1.05 ? "hours" : "hour") : "minutes");
export { hours as hoursOf };

/** The year's summary as a 1080 × 1920 story card. */
export async function summaryCard(y: YearStats, list: Badge[], persona: string, f: Fmt): Promise<Blob> {
  await ready();
  const t = tokens(), W = 1080, H = 1920, P = 96, on = t.on, dim = mix(on, t.tomato, 0.72);
  const [cv, c] = canvas(W, H, t.tomato);
  c.fillStyle = mix(on, t.tomato, 0.09);
  c.beginPath(); c.arc(W + 20, 330, 360, 0, Math.PI * 2); c.fill();
  brand(c, t, P, P, on, t.surface);
  font(c, 800, 330, DISPLAY);
  text(c, String(y.year), P - 12, 560, on, { track: -14 });
  font(c, 650, 104, DISPLAY);
  text(c, y.partial ? "in focus, so far" : "in focus", P, 690, on, { track: -2 });
  const top = y.labels[0];
  const stats: [string, string][] = [
    ["Focus", hours(y.ms) + " " + (y.ms >= 3600000 ? "h" : "min")],
    ["Cycles", y.cycles.toLocaleString()],
    ["Days", y.active.toLocaleString()],
    ["Streak", y.streak ? y.streak.days + (y.streak.days === 1 ? " day" : " days") : "–"],
    ["Best month", y.bestMonth == null ? "–" : f.fmtDate(new Date(y.year, y.bestMonth, 1).getTime(), { month: "long" })],
    ["Top label", top ? top.name : "–"],
  ];
  const colW = (W - 2 * P - 48) / 2;
  stats.forEach(([k, v], i) => {
    const x = P + (i % 2) * (colW + 48), yy = 800 + Math.floor(i / 2) * 196;
    c.fillStyle = mix(on, t.tomato, 0.28); c.fillRect(x, yy, colW, 3);
    font(c, 600, 30); text(c, k.toUpperCase(), x, yy + 58, dim, { track: 4 });
    font(c, 650, 84, DISPLAY); text(c, v, x, yy + 152, on, { max: colW, track: -2 });
  });
  font(c, 650, 50, DISPLAY);
  text(c, persona, P, 1440, on, { max: W - 2 * P, track: -1 });
  const got = list.filter((b) => b.earned), n = Math.min(6, Math.max(1, got.length)), s = 128, gap = (W - 2 * P - n * s) / Math.max(1, n - 1);
  if (got.length) {
    font(c, 600, 30); text(c, (got.length + " OF " + list.length + " BADGES").toUpperCase(), P, 1530, dim, { track: 4 });
    await emblems(c, t, got.slice(0, 12), t.tomato, on, (i) => [P + (i % 6) * (n > 1 ? s + Math.min(gap, 40) : 0), 1566 + Math.floor(i / 6) * (s + 22), s]);
  }
  font(c, 400, 30); text(c, f.fmtDate(y.start, { day: "numeric", month: "short" }) + " – " + f.fmtDate(Math.min(y.end, addDays(y.start, 364)), { day: "numeric", month: "short", year: "numeric" }), W - P, P + 58, dim, { align: "right" });
  return blob(cv);
}

/** Earned and locked badges as a 1080 × 1920 story card. */
export async function badgesCard(y: YearStats, list: Badge[]): Promise<Blob> {
  await ready();
  const t = tokens(), W = 1080, H = 1920, P = 96, bg = t.fg, fg = t.bg, dim = mix(t.bg, t.fg, 0.62);
  const [cv, c] = canvas(W, H, bg);
  brand(c, t, P, P, fg, t.surface);
  const got = list.filter((b) => b.earned).length;
  font(c, 600, 32); text(c, (y.year + " badges").toUpperCase(), P, 380, dim, { track: 5 });
  font(c, 800, 150, DISPLAY); text(c, got + " of " + list.length, P - 6, 530, fg, { track: -5 });
  font(c, 650, 64, DISPLAY); text(c, "earned" + (y.partial ? " so far" : ""), P, 616, fg, { track: -1 });
  const cols = 3, cell = (W - 2 * P) / cols, s = 190, rowH = 288, top = 700;
  await emblems(c, t, list, bg, fg, (i) => [P + (i % cols) * cell + (cell - s) / 2, top + Math.floor(i / cols) * rowH, s]);
  list.forEach((b, i) => {
    const x = P + (i % cols) * cell + cell / 2, yy = top + Math.floor(i / cols) * rowH + s + 50;
    font(c, 600, 31); text(c, b.name, x, yy, b.earned ? fg : dim, { align: "center", max: cell - 16 });
    if (!b.earned) { font(c, 400, 26); text(c, b.have + " of " + b.need, x, yy + 38, dim, { align: "center" }); }
  });
  return blob(cv);
}

/** A week's recap as a 1080 × 1350 card. */
export async function recapCard(r: WeekRecap, title: string, f: Fmt): Promise<Blob> {
  await ready();
  const t = tokens(), W = 1080, H = 1350, P = 88, bg = t.surface, fg = t.fg;
  const [cv, c] = canvas(W, H, bg);
  brand(c, t, P, P, fg, t.surface2);
  font(c, 400, 30); text(c, f.fmtDate(r.start, { day: "numeric", month: "short" }) + " – " + f.fmtDate(addDays(r.start, 6), { day: "numeric", month: "short", year: "numeric" }), W - P, P + 56, t.muted, { align: "right" });
  font(c, 600, 32); text(c, title.toUpperCase(), P, 330, t.faint, { track: 5 });
  font(c, 800, 190, DISPLAY); text(c, f.fmtDur(r.ms), P - 8, 500, fg, { track: -6, max: W - 2 * P });
  const delta = r.ms - r.before.ms;
  font(c, 400, 36);
  text(c, r.before.ms ? (delta >= 0 ? "+" : "−") + f.fmtDur(Math.abs(delta)) + " vs the week before" : "Focus this week", P, 570, r.before.ms ? (delta >= 0 ? t.leaf : t.warn) : t.muted);
  const stats: [string, string][] = [[String(r.cycles), r.cycles === 1 ? "cycle" : "cycles"], [r.active + "/7", "active days"], [String(r.finished.length), r.finished.length === 1 ? "task finished" : "tasks finished"], [String(r.streak), "day streak"]];
  const sw = (W - 2 * P - 3 * 20) / 4;
  stats.forEach(([v, k], i) => {
    const x = P + i * (sw + 20);
    round(c, x, 630, sw, 150, 28, t.surface2);
    font(c, 650, 60, DISPLAY); text(c, v, x + 28, 712, fg);
    font(c, 400, 26); text(c, k, x + 28, 754, t.muted, { max: sw - 40 });
  });
  const max = Math.max(1, ...r.days.map((d) => d.ms)), bw = (W - 2 * P - 6 * 22) / 7, bh = 230, base = 1090;
  r.days.forEach((d, i) => {
    const x = P + i * (bw + 22), h = d.ms ? Math.max(14, (d.ms / max) * bh) : 10;
    round(c, x, base - h, bw, h, 14, !d.ms ? t.heat[0] : r.best && d.t === r.best.t ? t.tomato : t.heat[2]);
    font(c, r.best && d.t === r.best.t ? 600 : 400, 28); text(c, f.fmtDate(d.t, { weekday: "short" }), x + bw / 2, base + 46, r.best && d.t === r.best.t ? fg : t.muted, { align: "center" });
  });
  const labels = r.labels.filter((l) => l.name).slice(0, 3);
  let x = P;
  font(c, 600, 30);
  for (const l of labels) {
    const s = l.name + "  " + f.fmtDur(l.ms), w = c.measureText(s).width + 70;
    if (x + w > W - P) break;
    round(c, x, 1200, w, 64, 32, t.surface2);
    c.fillStyle = `oklch(.68 .15 ${labelHue(l.name)})`; c.beginPath(); c.arc(x + 32, 1232, 9, 0, Math.PI * 2); c.fill();
    text(c, s, x + 52, 1242, fg, { max: w - 70 });
    x += w + 16;
  }
  return blob(cv);
}

/** Heat shade per day of the year, for the summary's mini calendar. */
export const yearCells = (y: YearStats) => {
  const out: { t: number; level: number; future: boolean }[] = [];
  for (let t = y.start; new Date(t).getFullYear() === y.year; t = addDays(t, 1)) out.push({ t, level: heatLevel((y.days.get(dayKey(t))?.ms || 0) / 60000), future: t > y.end });
  return out;
};

/** Shares a PNG with the system sheet where files can be shared, otherwise downloads it. */
export async function shareImage(b: Blob, name: string, title: string): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([b], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; } catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a"), url = URL.createObjectURL(b);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
