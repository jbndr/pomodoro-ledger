const FIND = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
export const MAX_LINKS = 10;

/** A web address worth keeping, normalised, or null; only http and https ever open. `bare` also takes "leetcode.com/x" typed without a scheme. */
export function cleanLink(raw: unknown, bare = false): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[.,;:!?'"»”]+$/, "");
  // A closing bracket belongs to the address only when it opened one, as on Wikipedia.
  while (s.endsWith(")") && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) s = s.slice(0, -1);
  if (/^www\./i.test(s) || (bare && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(?=[/:?#]|$)/i.test(s))) s = "https://" + s;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** The links in a line of text, and the text without them. */
export function takeLinks(text: string): { text: string; links: string[] } {
  const links: string[] = [];
  const rest = text.replace(FIND, (m) => {
    const u = cleanLink(m);
    if (!u) return m;
    if (!links.includes(u)) links.push(u);
    return m.slice(cleanLinkLength(m));
  });
  return { text: rest.replace(/\s{2,}/g, " ").trim(), links };
}

// Punctuation trimmed off an address stays in the text.
function cleanLinkLength(m: string) {
  let s = m.replace(/[.,;:!?'"»”]+$/, "");
  while (s.endsWith(")") && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) s = s.slice(0, -1);
  return s.length;
}

/** A task's links, cleaned and without repeats. */
export function linksOf(t: { links?: unknown }): string[] {
  const out: string[] = [];
  for (const l of Array.isArray(t.links) ? t.links : []) { const u = cleanLink(l); if (u && !out.includes(u)) out.push(u); }
  return out.slice(0, MAX_LINKS);
}

export const linkHost = (u: string) => new URL(u).hostname.replace(/^www\./, "");

/** "github.com/jbndr/…/pull/12": the site and enough of the path to tell links apart. */
export function linkLabel(u: string): string {
  const url = new URL(u), parts = url.pathname.split("/").filter(Boolean).map(decodeSafe);
  if (!parts.length) return linkHost(u);
  const path = parts.join("/");
  return linkHost(u) + "/" + (path.length <= 28 ? path : parts.length > 2 ? parts[0] + "/…/" + parts.slice(-2).join("/") : path.slice(0, 26) + "…");
}

function decodeSafe(s: string) { try { return decodeURIComponent(s); } catch { return s; } }
