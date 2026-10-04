import { dayKey } from "./dates";
import { firstDue, parseRepeat, type Repeat } from "./repeat";
import { parseWhen, type When } from "./when";

export type TitleToken = { text: string; kind: "when"; when: When } | { text: string; kind: "est"; est: number } | { text: string; kind: "repeat"; repeat: Repeat };

export interface ParsedTitle {
  title: string;
  when?: When;
  repeat?: Repeat;
  est: number;
  /** What was recognised, in title order. */
  tokens: TitleToken[];
}

/**
 * Reads "Call the accountant friday 2c" as title + When + estimate, and "Water plants every mon thu" as a repeat that starts on its first day. Tokens only count at the end of the title,
 * at least one word always stays as the title, and anything listed in `keep` (lower case) is left as text.
 */
export function parseTitle(raw: string, keep: string[] = [], now = Date.now()): ParsedTitle {
  const out: ParsedTitle = { title: raw.trim(), when: undefined, est: 0, tokens: [] };
  let t = out.title;
  const m = t.match(/(?:^|\s)(x(\d{1,2})|(\d{1,2}) ?(?:c|cycles?|pomos?|pomodoros?))$/i);
  if (m && m.index !== undefined && !keep.includes(m[1].toLowerCase()) && t.slice(0, m.index).trim()) {
    out.est = Math.min(24, Math.max(1, +(m[2] || m[3])));
    out.tokens.push({ text: m[1], kind: "est", est: out.est });
    t = t.slice(0, m.index).trimEnd();
  }
  const words = t.split(/\s+/), kept = (p: string) => keep.some((k) => k === p.toLowerCase() || k.endsWith(" " + p.toLowerCase()));
  for (let n = Math.min(7, words.length - 1); n >= 1; n--) {
    const phrase = words.slice(-n).join(" ");
    if (kept(phrase)) continue;
    const r = parseRepeat(phrase, now);
    if (!r) continue;
    const first = firstDue(r, dayKey(now));
    out.repeat = r;
    out.when = first === dayKey(now) ? "today" : first;
    out.tokens.unshift({ text: phrase, kind: "repeat", repeat: r });
    out.title = words.slice(0, -n).join(" ").trim();
    return out;
  }
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const phrase = words.slice(-n).join(" ");
    if (kept(phrase)) continue;
    const g = parseWhen(phrase, true, now);
    if (g == null) continue;
    out.when = g === "today" || (g !== "later" && g <= dayKey(now)) ? "today" : g;
    out.tokens.unshift({ text: phrase, kind: "when", when: out.when });
    t = words.slice(0, -n).join(" ");
    break;
  }
  out.title = t.trim();
  return out;
}

/** The "#label" being typed at the caret, if any: where its "#" sits and what follows it. */
export function hashToken(value: string, caret: number, end = caret): { at: number; query: string } | null {
  const at = value.lastIndexOf("#", caret - 1);
  if (caret !== end || at < 0 || (at > 0 && !/\s/.test(value[at - 1]))) return null;
  return { at, query: value.slice(at + 1, caret) };
}

/** The title without the last occurrence of a recognised token, ready to type on; null if it isn't there. */
export function dropToken(value: string, text: string): string | null {
  const i = value.toLowerCase().lastIndexOf(text.toLowerCase());
  if (i < 0) return null;
  return (value.slice(0, i) + value.slice(i + text.length)).replace(/\s+$/, "") + " ";
}

/** Break time between `est` focus cycles, with a long break after every `longEvery`. */
export function breaksBetween(est: number, longEvery: number, short: number, long: number): number {
  let ms = 0;
  for (let i = 1; i < est; i++) ms += i % longEvery ? short : long;
  return ms;
}
