import { MIN } from "./lib/dates";

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const fmtDur = (ms: number) => { const m = Math.round(ms / MIN); if (m < 60) return m + "m"; const h = Math.floor(m / 60), r = m % 60; return r ? h + "h " + r + "m" : h + "h"; };
export const fmtDate = (t: number, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Date(t).toLocaleDateString(undefined, o);
export const fmtClock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
export const plural = (n: number, w: string) => n + " " + w + (n === 1 ? "" : "s");
