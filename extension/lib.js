export const MIN = 60000;
export const HOUR = 60 * MIN;
export const MAX_AHEAD = 3 * HOUR;
export const PASS_MS = 5 * MIN;
export const PASSES = 3;
export const MODES = ["focus", "short", "long"];
export const STATUSES = ["idle", "running", "paused"];
export const APP_URL = "https://pomodoro.jbndr.com/";
export const APP_MATCHES = ["https://pomodoro.jbndr.com/*", "http://localhost/*"];
export const BLOCK_RULE = 1;
export const FALLBACK_RULE = 2;
export const PASS_RULE = 10;

export const WILD_TLDS = ["com", "co.uk", "de", "fr", "it", "es", "nl", "se", "pl", "be", "ca", "com.au", "co.jp", "in", "com.mx", "com.br", "com.tr", "ae", "sa", "sg", "eg", "ie"];

export const PRESETS = {
  Social: ["x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "reddit.com", "linkedin.com"],
  Video: ["youtube.com", "netflix.com", "twitch.tv"],
  News: ["news.google.com", "cnn.com", "bbc.com", "nytimes.com", "theguardian.com", "news.ycombinator.com"],
  Shopping: ["amazon.*", "ebay.com", "etsy.com", "aliexpress.com"],
};

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** A bare hostname from whatever was typed, or null if it isn't one. */
export function normalizeDomain(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^/?#]*@/, "");
  s = s.split(/[/?#]/)[0].replace(/:\d*$/, "").replace(/\.$/, "");
  if (s.startsWith("*.")) s = s.slice(2);
  if (s.startsWith("www.")) s = s.slice(4);
  if (/^[a-z0-9-]+\.\*$/.test(s)) return LABEL.test(s.slice(0, -2)) ? s : null;
  let host;
  try { host = new URL("http://" + s).hostname; } catch { return null; }
  if (host !== s && !s.split(".").some((l) => /[^\x00-\x7f]/.test(l))) return null;
  if (host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  return host;
}

/** Hostnames a stored entry covers; `name.*` becomes one per common TLD. */
export const expandDomain = (d) => (d.endsWith(".*") ? WILD_TLDS.map((t) => d.slice(0, -1) + t) : [d]);

export const expandAll = (list) => [...new Set(list.flatMap(expandDomain))];

/** The host permission pattern for a hostname and its subdomains. */
export const originOf = (host) => "*://*." + host + "/*";

export const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).map(normalizeDomain).filter(Boolean))];

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/\.$/, ""); } catch { return ""; } };

/** The entry in `list` that covers `host`, if any. */
export function entryFor(list, host) {
  host = host.replace(/^www\./, "");
  return list.find((d) => expandDomain(d).some((h) => host === h || host.endsWith("." + h))) || null;
}

/** A checked timer message, or null if anything about it is off. */
export function validateTimer(m, now) {
  if (!m || typeof m !== "object" || m.type !== "timer") return null;
  if (!MODES.includes(m.mode) || !STATUSES.includes(m.status)) return null;
  const { endsAt } = m;
  if (m.status === "running") {
    if (typeof endsAt !== "number" || !Number.isFinite(endsAt) || endsAt > now + MAX_AHEAD + MIN || endsAt < now - MIN) return null;
  } else if (endsAt !== null) return null;
  if (m.task != null && typeof m.task !== "string") return null;
  const task = typeof m.task === "string" ? m.task.trim().slice(0, 200) || null : null;
  return { mode: m.mode, status: m.status, endsAt: m.status === "running" ? endsAt : null, task, at: now };
}

export function shouldBlock(timer, now) {
  return !!timer && timer.mode === "focus" && timer.status === "running" && typeof timer.endsAt === "number" &&
    timer.endsAt > now && now - (timer.at || 0) <= MAX_AHEAD;
}

/** Folds a new timer state into the escape hatch counter; a round lasts until focus stops or goes idle. */
export function nextPasses(passes, timer) {
  if (!timer || timer.mode !== "focus" || timer.status === "idle") return { used: 0, allow: {} };
  return passes || { used: 0, allow: {} };
}

export const livePasses = (passes, now) => Object.fromEntries(Object.entries((passes && passes.allow) || {}).filter(([, until]) => until > now));

export function grantPass(passes, entry, now) {
  const p = passes || { used: 0, allow: {} };
  if (p.used >= PASSES) return null;
  return { used: p.used + 1, allow: { ...livePasses(p, now), [entry]: now + PASS_MS } };
}

/** The dynamic rules for this moment: redirect sites we may redirect, plainly block the rest, and let passes through. */
export function buildRules({ domains, granted, timer, passes, now, page }) {
  if (!shouldBlock(timer, now) || !domains.length) return [];
  const hosts = expandAll(domains), ok = hosts.filter((h) => granted.has(h)), rest = hosts.filter((h) => !granted.has(h));
  const rules = [];
  if (ok.length) rules.push({ id: BLOCK_RULE, priority: 1, action: { type: "redirect", redirect: { regexSubstitution: page + "?u=\\0" } }, condition: { regexFilter: "^.+$", requestDomains: ok, resourceTypes: ["main_frame"] } });
  if (rest.length) rules.push({ id: FALLBACK_RULE, priority: 1, action: { type: "block" }, condition: { requestDomains: rest, resourceTypes: ["main_frame"] } });
  Object.keys(livePasses(passes, now)).filter((d) => domains.includes(d)).forEach((d, i) => {
    rules.push({ id: PASS_RULE + i, priority: 2, action: { type: "allow" }, condition: { requestDomains: expandDomain(d), resourceTypes: ["main_frame"] } });
  });
  return rules;
}

/** When the rules next need rebuilding, or null. */
export function nextWake(timer, passes, now) {
  if (!shouldBlock(timer, now)) return null;
  return Math.min(timer.endsAt, ...Object.values(livePasses(passes, now)));
}

export const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
  return (m < 10 ? "0" : "") + m + ":" + String(s % 60).padStart(2, "0");
};

export const plural = (n, one, many = one + "s") => n + " " + (n === 1 ? one : many);

export function statusLine(timer, domains, now) {
  if (!domains.length) return "No sites on your list yet.";
  if (!shouldBlock(timer, now)) return "Not blocking. Starts with your next focus round.";
  return "Blocking " + plural(domains.length, "site") + " · " + clock(timer.endsAt - now) + " left";
}

/** The page the blocked tab came from, if it's a web page. */
export function originalUrl(href) {
  const i = href.indexOf("?u=");
  if (i < 0) return null;
  const u = href.slice(i + 3);
  try { const url = new URL(u); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}

export function isAppUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" && u.hostname === "pomodoro.jbndr.com" && !u.port) || (u.protocol === "http:" && u.hostname === "localhost");
  } catch { return false; }
}
