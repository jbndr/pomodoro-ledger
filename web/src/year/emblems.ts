import type { BadgeId } from "../lib/year";

type Shape = "circle" | "rosette" | "hex" | "shield";

interface Look { shape: Shape; from: string; to: string }

/** Medal colours stay the same in light and dark mode, like printed enamel. */
const LOOK: Record<BadgeId, Look> = {
  century: { shape: "rosette", from: "#FF8A63", to: "#C7311A" },
  week: { shape: "hex", from: "#FFC15A", to: "#DB6A12" },
  marathon: { shape: "circle", from: "#62B0F5", to: "#2152A6" },
  early: { shape: "circle", from: "#FFC170", to: "#E5533A" },
  owl: { shape: "circle", from: "#5157C2", to: "#1B1D58" },
  weekend: { shape: "shield", from: "#48C892", to: "#156B4B" },
  loyal: { shape: "circle", from: "#F383BC", to: "#9D3473" },
  goal: { shape: "circle", from: "#FAD25A", to: "#C9820C" },
  comeback: { shape: "circle", from: "#45D3C6", to: "#11777A" },
  allYear: { shape: "rosette", from: "#AD94FF", to: "#5537C4" },
  month: { shape: "hex", from: "#FF8F52", to: "#C42B19" },
  finisher: { shape: "shield", from: "#6A717D", to: "#1F2329" },
};

const f = (n: number) => +n.toFixed(2);

function rounded(pts: [number, number][], t = 0.18) {
  const at = (i: number) => pts[(i + pts.length) % pts.length];
  const lerp = (a: [number, number], b: [number, number], k: number) => [f(a[0] + (b[0] - a[0]) * k), f(a[1] + (b[1] - a[1]) * k)];
  let d = "";
  pts.forEach((p, i) => {
    const a = lerp(p, at(i - 1), t), b = lerp(p, at(i + 1), t);
    d += (i ? "L" : "M") + a + "Q" + p + " " + b;
  });
  return d + "Z";
}

const SHAPE: Record<Shape, string> = {
  circle: "M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92Z",
  rosette: [...Array(181)].map((_, i) => {
    const a = (i / 180) * Math.PI * 2, r = 44.6 + 2.6 * Math.cos(a * 18);
    return (i ? "L" : "M") + f(50 + Math.sin(a) * r) + " " + f(50 - Math.cos(a) * r);
  }).join("") + "Z",
  hex: rounded([...Array(6)].map((_, i) => { const a = (i / 6) * Math.PI * 2; return [f(50 + Math.sin(a) * 49), f(50 - Math.cos(a) * 49)] as [number, number]; })),
  shield: "M50 4.5C60 9 74 12 86 12.5c2.4.1 3.8 1.6 3.8 4V45c0 25-16.5 41.6-37.6 50.2a5.6 5.6 0 0 1-4.4 0C26.7 86.6 10.2 70 10.2 45V16.5c0-2.4 1.4-3.9 3.8-4C26 12 40 9 50 4.5Z",
};

/** Glyph colours: white ink plus a dark and an accent, all one tone when locked. */
interface Pen { w: string; soft: string; dark: string; hot: string; gold: string; id: string }

const line = (d: string, c: string, w: number, extra = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

const GLYPH: Record<BadgeId, (p: Pen) => string> = {
  century: (p) => line("M26 41.5 32.5 36v28", p.w, 6.4) +
    `<ellipse cx="47.5" cy="50" rx="8.4" ry="13.2" fill="none" stroke="${p.w}" stroke-width="6.4"/><ellipse cx="68.5" cy="50" rx="8.4" ry="13.2" fill="none" stroke="${p.w}" stroke-width="6.4"/>` +
    `<path d="M50 74.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z" fill="${p.gold}"/>`,
  week: (p) => `<path d="M50 17c2.4 11.2 17 17.6 17 35.4a17 17 0 0 1-34 0c0-9 4.6-14.6 8.6-18.6.3 5.6 2.6 9 6 10.4-1.6-9.6.2-19.2 2.4-27.2z" fill="${p.w}"/>` +
    `<path d="M50.4 42.5c1.4 6 8.6 8.8 8.6 16.4a9 9 0 0 1-18 0c0-5.4 4.4-8.6 6.6-11 .4 2.4 1.4 3.6 2.8 4.2-.6-3.4-.6-6.6 0-9.6z" fill="${p.gold}"/>` +
    [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${32 + i * 6}" cy="82" r="2.1" fill="${p.w}"/>`).join(""),
  marathon: (p) => `<path d="M17 74 36 47l12 16z" fill="${p.soft}"/><path d="M28 74 54 33l26 41z" fill="${p.w}"/>` +
    `<path d="M54 33 80 74H60l2-20z" fill="${p.dark}" opacity=".18"/><path d="M47.2 43.7 54 33l6.8 10.7-3.4 2.6-3.4-2.4-3.4 2.4z" fill="${p.soft}"/>` +
    line("M54 33V15", p.w, 2.6) + `<path d="M55 15.5 69 20l-14 4.6z" fill="${p.hot}"/>`,
  early: (p) => `<path d="M29 63a21 21 0 0 1 42 0z" fill="${p.gold}"/>` +
    [-150, -120, -90, -60, -30].map((deg) => { const a = (deg * Math.PI) / 180; return line(`M${f(50 + Math.cos(a) * 26)} ${f(63 + Math.sin(a) * 26)}L${f(50 + Math.cos(a) * 33)} ${f(63 + Math.sin(a) * 33)}`, p.gold, 4.2); }).join("") +
    line("M18 63h64", p.w, 4.4) + line("M30 72h40", p.w, 4.4, ' opacity=".72"') + line("M40 80.5h20", p.w, 4.4, ' opacity=".45"'),
  owl: (p) => `<circle cx="22" cy="28" r="1.6" fill="${p.w}"/><circle cx="79" cy="33" r="1.3" fill="${p.w}"/><path d="M73 15.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="${p.gold}"/>` +
    `<path d="M29 41c0-9 3.4-14.5 9.5-16.2l4 7.3a24 24 0 0 1 15 0l4-7.3C67.6 26.5 71 32 71 41v18c0 13.6-9 21-21 21s-21-7.4-21-21z" fill="${p.soft}"/>` +
    [41, 59].map((x) => `<circle cx="${x}" cy="47" r="9" fill="${p.w}"/><circle cx="${x}" cy="47.5" r="5.4" fill="${p.gold}"/><circle cx="${x}" cy="47.8" r="2.7" fill="${p.dark}"/><circle cx="${x + 1.6}" cy="46" r="1.1" fill="${p.w}"/>`).join("") +
    `<path d="M46.6 57h6.8L50 63.4z" fill="${p.gold}"/>` + line("M40 69.5l3.4 2.6 3.3-2.6 3.3 2.6 3.3-2.6 3.3 2.6 3.4-2.6", p.dark, 2, ' opacity=".35"'),
  weekend: (p) => line("M20.5 45.5 15 41.5M79.5 45.5l5.5-4", p.w, 3.4) + line("M45.5 49q4.5-4.6 9 0", p.w, 3.4) +
    [21.5, 54.5].map((x) => `<rect x="${x}" y="42" width="24" height="17.5" rx="8" fill="${p.dark}" stroke="${p.w}" stroke-width="3.4"/>` + line(`M${x + 5} ${48}l5.4-3.2`, p.w, 2.4, ' opacity=".8"')).join("") +
    `<path d="M50 70.5c-6.2 0-10.6-2.4-12.4-5.6h24.8c-1.8 3.2-6.2 5.6-12.4 5.6z" fill="${p.w}"/>`,
  loyal: (p) => `<g transform="rotate(-32 50 50)">` + line("M33.5 50C25 42 22 33 25.5 25", p.w, 2.4, ' opacity=".85"') +
    `<path d="M34.5 37.5h24.6c1.2 0 2.3.5 3.1 1.3l9.5 9.5a2.4 2.4 0 0 1 0 3.4l-9.5 9.5c-.8.8-1.9 1.3-3.1 1.3H34.5a4.6 4.6 0 0 1-4.6-4.6V42.1a4.6 4.6 0 0 1 4.6-4.6z" fill="${p.w}"/>` +
    `<circle cx="36.2" cy="50" r="3.2" fill="${p.dark}"/><path d="M54 57.6c-8.4-5.2-9.6-10-6.6-12.2 2-1.4 4.8-.8 6.6 1.6 1.8-2.4 4.6-3 6.6-1.6 3 2.2 1.8 7-6.6 12.2z" fill="${p.hot}"/></g>`,
  goal: (p) => `<circle cx="47" cy="53" r="23" fill="${p.w}"/><circle cx="47" cy="53" r="15.5" fill="${p.hot}"/><circle cx="47" cy="53" r="8.5" fill="${p.w}"/><circle cx="47" cy="53" r="3.6" fill="${p.hot}"/>` +
    line("M47 53 73 27", p.dark, 3.4) + `<path d="M70 30l2-10.6 5.4 2.6zM70 30l10.6-2-2.6-5.4z" fill="${p.w}" stroke="${p.dark}" stroke-width="1.6" stroke-linejoin="round"/>`,
  comeback: (p) => line("M66 31H45a15.5 15.5 0 0 0 0 31h12", p.w, 8) + `<path d="M55 50.5 70.5 62 55 73.5z" fill="${p.w}" stroke="${p.w}" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="72" cy="31" r="5.2" fill="${p.gold}"/>` + line("M24 74h8M20 66h6", p.w, 3.4, ' opacity=".5"'),
  allYear: (p) => `<circle cx="50" cy="50" r="24" fill="none" stroke="${p.w}" stroke-width="1.8" opacity=".5"/>` +
    [...Array(12)].map((_, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${f(50 + Math.cos(a) * 24)}" cy="${f(50 + Math.sin(a) * 24)}" r="${i ? 3.3 : 5}" fill="${i ? p.w : p.gold}"/>`; }).join("") +
    [...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2; return line(`M${f(50 + Math.cos(a) * 12.5)} ${f(50 + Math.sin(a) * 12.5)}L${f(50 + Math.cos(a) * 15.5)} ${f(50 + Math.sin(a) * 15.5)}`, p.gold, 2.4); }).join("") +
    `<circle cx="50" cy="50" r="8.6" fill="${p.gold}"/>`,
  month: (p) => line("M38.5 26v9M61.5 26v9", p.w, 4.4) +
    `<rect x="26" y="31" width="48" height="44" rx="8" fill="${p.w}"/><path d="M26 39a8 8 0 0 1 8-8h32a8 8 0 0 1 8 8v4H26z" fill="${p.soft}"/>` +
    [0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${34.4 + c * 7.8}" cy="${51 + r * 8}" r="2.5" fill="${p.hot}"/>`)).join(""),
  finisher: (p) => `<defs><clipPath id="${p.id}f"><path d="M35.5 25.5q9.6-5 19.2 0t19.3 0v27q-9.6 5-19.3 0t-19.2 0z"/></clipPath></defs>` +
    line("M33.5 22v58", p.gold, 4.2) + `<path d="M35.5 25.5q9.6-5 19.2 0t19.3 0v27q-9.6 5-19.3 0t-19.2 0z" fill="${p.w}"/>` +
    `<g clip-path="url(#${p.id}f)" fill="${p.dark}">` + [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4].filter((c) => (r + c) % 2 === 0).map((c) => `<rect x="${f(35.5 + c * 7.7)}" y="${f(19 + r * 9)}" width="7.75" height="9.05"/>`)).join("") + "</g>" +
    `<path d="M57 64.5l2 4.2 4.6.6-3.4 3.2.9 4.5-4.1-2.2-4.1 2.2.9-4.5-3.4-3.2 4.6-.6z" fill="${p.gold}"/>`,
};

let uid = 0;

export interface EmblemOpts {
  locked?: boolean;
  /** Ink for a locked badge's outline and silhouette. */
  fg?: string;
  xmlns?: boolean;
}

/** A badge's medal as SVG markup. */
export function emblem(id: BadgeId, o: EmblemOpts = {}): string {
  const look = LOOK[id], d = SHAPE[look.shape], k = "yb" + (uid++).toString(36), fg = o.fg || "currentColor";
  const head = `<svg${o.xmlns ? ' xmlns="http://www.w3.org/2000/svg" width="200" height="200"' : ""} viewBox="0 0 100 100" aria-hidden="true">`;
  if (o.locked) {
    const pen: Pen = { w: fg, soft: fg, dark: "none", hot: fg, gold: fg, id: k };
    return head + `<path d="${d}" fill="none" stroke="${fg}" stroke-opacity=".38" stroke-width="2" stroke-dasharray="4 5" transform="translate(50 50) scale(.96) translate(-50 -50)"/><g opacity=".26">${GLYPH[id](pen)}</g></svg>`;
  }
  const pen: Pen = { w: "#FFFFFF", soft: "rgba(255,255,255,.62)", dark: look.to, hot: "#FF5A3C", gold: "#FFD45E", id: k };
  if (id === "goal") pen.hot = "#E2452B";
  if (id === "loyal") pen.hot = "#E04F93";
  if (id === "month") pen.hot = "#E2522F";
  if (id === "owl") { pen.soft = "#E4E2FF"; pen.dark = "#1B1D58"; }
  if (id === "weekend") pen.dark = "#10261D";
  if (id === "finisher") pen.dark = "#22262D";
  return head + `<defs>` +
    `<linearGradient id="${k}b" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${look.from}"/><stop offset="1" stop-color="${look.to}"/></linearGradient>` +
    `<radialGradient id="${k}g" cx=".32" cy=".18" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<path d="${d}" fill="url(#${k}b)"/>` +
    `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="2.4" transform="translate(50 50) scale(.975) translate(-50 -50)"/>` +
    `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="1.6" transform="translate(50 50) scale(.86) translate(-50 -50)"/>` +
    GLYPH[id](pen) +
    `<path d="${d}" fill="url(#${k}g)"/>` +
    `</svg>`;
}

/** The medal's outline as a CSS mask, so the foil only lights the medal. */
export function shapeMask(id: BadgeId): string {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${SHAPE[LOOK[id].shape]}"/></svg>`)}")`;
}
