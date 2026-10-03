import { dayKey } from "./dates";
import { parseWhen, type When } from "./when";

export type TitleToken = { text: string; kind: "when"; when: When } | { text: string; kind: "est"; est: number };

export interface ParsedTitle {
  title: string;
  when?: When;
  est: number;
  /** What was recognised, in title order. */
  tokens: TitleToken[];
}

/**
 * Reads "Call the accountant friday 2c" as title + When + estimate. Tokens only count at the end of the title,
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
  const words = t.split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const phrase = words.slice(-n).join(" ");
    if (keep.includes(phrase.toLowerCase())) continue;
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
