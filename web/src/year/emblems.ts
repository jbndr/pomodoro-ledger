import type { BadgeId } from "../lib/year";

export interface Ink { tomato: string; leaf: string; sky: string; warn: string; fg: string; tint: string; face: string }

type Hue = "tomato" | "leaf" | "sky" | "warn";

export const HUE: Record<BadgeId, Hue> = {
  century: "tomato", week: "warn", marathon: "sky", early: "warn", owl: "sky", weekend: "leaf",
  loyal: "tomato", goal: "tomato", comeback: "leaf", allYear: "leaf", month: "warn", finisher: "leaf",
};

const ring = (n: number, r: number, fn: (x: number, y: number, i: number) => string) =>
  [...Array(n)].map((_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return fn(24 + Math.cos(a) * r, 24 + Math.sin(a) * r, i); }).join("");

const tick = (d: string, c: string, w = 3.6) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const GLYPH: Record<BadgeId, (k: Ink) => string> = {
  century: (k) => ring(10, 14, (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.1" fill="${k.tomato}"/>`) + tick("M18.5 24.5l3.6 3.6 7.4-8.2", k.leaf),
  week: (k) => `<path d="M24 10.5c1.6 5 9.5 8.6 9.5 17.3a9.5 9.5 0 0 1-19 0c0-4.6 2.4-7.4 4.4-9.4.2 2.6 1.5 4.3 3.1 4.9-.6-4.7.4-9.3 2-12.8z" fill="${k.warn}"/><circle cx="24" cy="29.5" r="3.6" fill="${k.tomato}"/>`,
  marathon: (k) => tick("M16.5 36V12.5", k.fg, 3) + `<path d="M17.5 12.5h14.2l-3.4 5.2 3.4 5.3H17.5z" fill="${k.sky}" stroke="${k.sky}" stroke-width="1.6" stroke-linejoin="round"/>` + tick("M12 36h12", k.fg, 3),
  early: (k) => `<path d="M14.5 31a9.5 9.5 0 0 1 19 0z" fill="${k.warn}"/>` + tick("M24 13.5v3.4M13.6 18.3l2.4 2.4M34.4 18.3 32 20.7", k.warn, 3) + tick("M11 31h26M17 36h14", k.fg, 3),
  owl: (k) => `<path d="M27.8 12.2a12 12 0 1 0 8.9 17.6 9.6 9.6 0 1 1-8.9-17.6z" fill="${k.sky}"/><circle cx="33.6" cy="16.2" r="1.9" fill="${k.warn}"/><circle cx="37.2" cy="22" r="1.2" fill="${k.warn}"/>`,
  weekend: (k) => `<path d="M24 10.5l11.5 4.2v8.6c0 7-4.8 12.2-11.5 14.4-6.7-2.2-11.5-7.4-11.5-14.4v-8.6z" fill="${k.leaf}"/>` + tick("M19 24.3l3.5 3.5 6.6-7.2", k.face, 3.4),
  loyal: (k) => `<path d="M13 15.5v8.2c0 .8.3 1.6.9 2.1l10.3 10.3c1.2 1.2 3 1.2 4.2 0l7.6-7.6c1.2-1.2 1.2-3 0-4.2L25.7 14c-.6-.6-1.3-.9-2.1-.9h-8.2a2.4 2.4 0 0 0-2.4 2.4z" fill="${k.tomato}"/><circle cx="19.2" cy="19.3" r="2.6" fill="${k.face}"/>`,
  goal: (k) => `<circle cx="24" cy="24" r="12.5" fill="none" stroke="${k.fg}" stroke-width="2.6"/><circle cx="24" cy="24" r="7" fill="none" stroke="${k.fg}" stroke-width="2.6"/><circle cx="24" cy="24" r="3.4" fill="${k.tomato}"/>`,
  comeback: (k) => tick("M15.6 19.6A9.8 9.8 0 1 1 14.2 26", k.leaf) + tick("M14.6 13.6v6.4H21", k.leaf) + `<circle cx="24" cy="24.5" r="3.2" fill="${k.tomato}"/>`,
  allYear: (k) => ring(12, 11.5, (x, y, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2, dx = Math.cos(a) * 2.2, dy = Math.sin(a) * 2.2; return tick(`M${(x - dx).toFixed(2)} ${(y - dy).toFixed(2)}L${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`, i % 3 ? k.leaf : k.tomato, 2.8); }) + `<circle cx="24" cy="24" r="3.4" fill="${k.fg}"/>`,
  month: (k) => `<rect x="13" y="14" width="22" height="21" rx="4.5" fill="none" stroke="${k.fg}" stroke-width="2.6"/>` + tick("M19 11.5v4.5M29 11.5v4.5", k.fg, 2.6) +
    [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<circle cx="${18.5 + c * 5.5}" cy="${21.5 + r * 4.7}" r="1.75" fill="${r === 2 && c === 2 ? k.tomato : k.warn}"/>`)).join(""),
  finisher: (k) => [15.5, 24, 32.5].map((y) => tick(`M12.5 ${y}l2.2 2.2 4.1-4.6`, k.leaf, 2.8) + tick(`M23.5 ${y}h12`, k.fg, 2.8)).join(""),
};

/** A badge's round emblem as SVG markup; a locked one is a dashed outline with a faint glyph. */
export function emblem(id: BadgeId, k: Ink, locked = false, xmlns = false): string {
  const q: Ink = locked ? { ...k, tomato: k.fg, leaf: k.fg, sky: k.fg, warn: k.fg } : k;
  const body = (locked
    ? `<circle cx="24" cy="24" r="22.4" fill="none" stroke="${k.fg}" stroke-opacity=".4" stroke-width="1.2" stroke-dasharray="2.4 3.2"/><g opacity=".3">`
    : `<circle cx="24" cy="24" r="23" fill="${k.tint}"/><g>`) + GLYPH[id](q) + "</g>";
  return `<svg${xmlns ? ' xmlns="http://www.w3.org/2000/svg" width="96" height="96"' : ""} viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
}

/** Colours for an emblem drawn inline, from the page's tokens. */
export function cssInk(id: BadgeId, locked = false): Ink {
  const tint = `color-mix(in oklab, var(--${HUE[id]}) 17%, var(--surface))`;
  return { tomato: "var(--tomato)", leaf: "var(--leaf)", sky: "var(--sky)", warn: "var(--warn)", fg: locked ? "var(--yr-fg)" : "var(--fg)", face: locked ? "var(--yr-bg)" : tint, tint };
}
