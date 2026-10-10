import { DurableObject } from "cloudflare:workers";
import { accessEmail, syncConfigured } from "./sync.js";

const PAGES = {
  "/": { "open-app": ["header", "hero", "end", "footer"], "try-demo": ["hero", "live", "end", "footer"], "try-here": ["live"] },
  "/features": { "open-app": ["header", "end", "footer"], "try-demo": ["end", "footer"] },
};
const CTA = { "open-app": "Open the app", "try-demo": "Try the demo", "try-here": "Try it right here" };
const SHORT = { "open-app": "Open app", "try-demo": "Demo", "try-here": "Try here" };
const SPOT = { header: "Header", hero: "Hero", live: "Live demo", end: "End of page", footer: "Footer" };
const DAYS = 30;

const events = (p) => ["view", ...Object.entries(PAGES[p]).flatMap(([c, spots]) => spots.map((s) => c + ":" + s))];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const counts = (env) => env.COUNTS.get(env.COUNTS.idFromName("site"));
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Same-origin beacons only, so another site can't run up the numbers through its visitors' browsers.
export function hit(request, env, url, ctx) {
  const page = url.searchParams.get("p"), event = url.searchParams.get("e");
  if (request.method === "POST" && request.headers.get("Origin") === url.origin && Object.hasOwn(PAGES, page) && events(page).includes(event)) {
    ctx.waitUntil(counts(env).add(page, event));
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function stats(request, env, url) {
  if (!syncConfigured(env)) return json({ error: "not found" }, 404);
  const email = await accessEmail(request, env);
  if (!email) return json({ error: "signed out" }, 401);
  if (!String(env.STATS_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).includes(email)) return json({ error: "forbidden" }, 403);
  const now = Date.now(), days = [...Array(DAYS)].map((_, i) => utcDay(now - i * 864e5));
  const data = summarize(await counts(env).since(days.at(-1)), days);
  if (url.searchParams.get("format") === "json") return json(data);
  return new Response(render(data), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

// Newest day first. The 7-day totals use full days, so today's partial count doesn't skew them.
function summarize(rows, days) {
  const pages = {};
  for (const p of Object.keys(PAGES)) {
    const by = new Map(days.map((d) => [d, Object.fromEntries(events(p).map((e) => [e, 0]))]));
    for (const r of rows) if (r.page === p && by.has(r.day) && Object.hasOwn(by.get(r.day), r.event)) by.get(r.day)[r.event] = r.n;
    const sum = (ds) => Object.fromEntries(events(p).map((e) => [e, ds.reduce((n, d) => n + by.get(d)[e], 0)]));
    pages[p] = { days: days.map((d) => ({ day: d, ...by.get(d) })), last7: sum(days.slice(1, 8)), prev7: sum(days.slice(8, 15)) };
  }
  return { tz: "UTC", today: days[0], pages };
}

const num = (n) => n.toLocaleString("en-US");
const rate = (n, views) => (views ? (n / views * 100).toFixed(1) + "%" : "–");
const total = (row, cta) => Object.entries(row).reduce((n, [e, v]) => n + (e.startsWith(cta + ":") ? v : 0), 0);
const dayName = (d, opts) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const cell = (n, views) => `<td${n ? "" : ' class="z"'}>${num(n)}${views === undefined ? "" : `<small>${n ? rate(n, views) : ""}</small>`}</td>`;

function change(now, prev) {
  if (!prev) return now ? '<em class="up">New</em>' : "";
  const pct = Math.round((now - prev) / prev * 100);
  return `<em class="${pct > 0 ? "up" : pct < 0 ? "down" : ""}">${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%</em>`;
}

function tiles(pg, ctas) {
  const { last7: a, prev7: b } = pg;
  const tile = (k, n, p, now, before) => `<div class="tile"><span class="k">${k}</span><span class="v">${num(n)}${change(n, p)}</span><span class="f">${now}</span><span class="f2">${before}</span></div>`;
  return `<div class="tiles">${tile("Views", a.view, b.view, `${num(Math.round(a.view / 7))} a day`, `${num(b.view)} the 7 before`)}${Object.keys(ctas).map((c) => {
    const n = total(a, c), p = total(b, c);
    return tile(CTA[c], n, p, `${rate(n, a.view)} of views`, `${rate(p, b.view)} the 7 before`);
  }).join("")}</div>`;
}

function chart(pg, today) {
  const days = pg.days.slice().reverse(), max = Math.max(1, ...days.map((d) => d.view)), all = days.reduce((n, d) => n + d.view, 0);
  const bars = days.map((d) => {
    const tip = `${d.day === today ? "Today so far" : dayName(d.day, { weekday: "short", day: "numeric", month: "short" })}  ·  ${num(d.view)} ${d.view === 1 ? "view" : "views"}  ·  ${num(total(d, "open-app"))} opened the app`;
    return `<span class="b${d.day === today ? " now" : ""}" data-tip="${tip}"><i style="height:${(d.view / max * 100).toFixed(2)}%"></i></span>`;
  }).join("");
  const empty = days.every((d) => !d.view) ? '<span class="none">Nothing counted yet</span>' : "";
  return `<div class="chart" role="img" aria-label="Views per day over the last 30 days. The table below has the numbers.">
<span class="sum">${num(all)} ${all === 1 ? "view" : "views"} in 30 days</span><span class="max">${num(max)}</span><div class="bars">${bars}</div>${empty}
<div class="x"><span>${dayName(days[0].day, { day: "numeric", month: "short" })}</span><span>Today</span></div></div>`;
}

function spots(pg, ctas) {
  const { last7: a, prev7: b } = pg;
  const rows = [`<tr class="grp"><td>Views</td>${cell(a.view)}${cell(b.view)}</tr>`];
  for (const [c, list] of Object.entries(ctas)) {
    rows.push(`<tr class="grp"><td>${CTA[c]}</td>${cell(total(a, c), a.view)}${cell(total(b, c), b.view)}</tr>`);
    if (list.length > 1) for (const s of list) rows.push(`<tr class="sub"><td>${SPOT[s]}</td>${cell(a[c + ":" + s], a.view)}${cell(b[c + ":" + s], b.view)}</tr>`);
  }
  return `<table><thead><tr><th></th><th>Last 7 days</th><th>The 7 before</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function daily(pg, ctas, today) {
  const head = Object.keys(ctas).map((c) => `<th>${SHORT[c]}</th>`).join("");
  const rows = pg.days.map((d) => `<tr><td>${d.day === today ? "Today <small>so far</small>" : `${dayName(d.day, { weekday: "short", day: "numeric" })}<span class="mo"> ${dayName(d.day, { month: "short" })}</span>`}</td>${cell(d.view)}${Object.keys(ctas).map((c) => cell(total(d, c))).join("")}<td class="r">${rate(total(d, "open-app"), d.view)}</td></tr>`).join("");
  return `<div class="scroll"><table class="days"><thead><tr><th>Day</th><th>Views</th>${head}<th title="Open the app, per view">Open %</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function render(data) {
  const home = data.pages["/"], feat = data.pages["/features"];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Landing page counts</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..700&family=Geist:wght@400..600&display=swap">
<script>try { const t = JSON.parse(localStorage.getItem("pl.theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<a class="brand" href="/"><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="5.6" cy="14" r="4.5" fill="var(--tomato)"/><path d="M13.04 20.96L22.16 7.76" fill="none" stroke="var(--leaf)" stroke-width="6" stroke-linecap="round"/></svg>Pomodoro Ledger</a>
<h1>Landing page</h1>
<p class="sub">Visits and clicks for the last 30 days, in UTC. <a href="?format=json">JSON</a></p>
</header>
<section><h2>Last 7 full days, against the 7 before</h2>${tiles(home, PAGES["/"])}</section>
<section><h2>Views per day</h2><div class="card">${chart(home, data.today)}</div></section>
<section><h2>Where the clicks come from</h2><div class="card">${spots(home, PAGES["/"])}</div></section>
<section><h2>Day by day</h2><div class="card">${daily(home, PAGES["/"], data.today)}</div></section>
<section><h2>Features page</h2><div class="card">${spots(feat, PAGES["/features"])}</div></section>
<footer>Counted by a beacon from the page itself: no cookies, no IP addresses, nothing per visitor, only a number per day. Crawlers that don't run scripts, automated browsers and visitors with Do Not Track or Global Privacy Control aren't counted, so treat the numbers as a floor and compare them with each other.</footer>
</main>
</body>
</html>`;
}

const CSS = `
:root {
  --bg: #F6F7F5; --surface: #FFFFFF; --line: #E2E5E1; --line-2: #CDD2CC;
  --fg: #141816; --muted: #5E6862; --faint: #8C958F;
  --tomato: oklch(59.3% .192 34.1); --leaf: oklch(52.7% .103 162.7); --sky: oklch(51.5% .126 252.9);
  --shadow: 0 0 0 1px rgb(20 24 22 / .06), 0 1px 2px rgb(20 24 22 / .05);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0E1110; --surface: #161A18; --line: #252B28; --line-2: #343C38;
    --fg: #E8ECE9; --muted: #A0A9A3; --faint: #6D7671;
    --tomato: oklch(70.5% .189 34.3); --leaf: oklch(73.9% .132 162.8); --sky: oklch(72.2% .116 252.5);
    --shadow: 0 0 0 1px rgb(255 255 255 / .05);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0E1110; --surface: #161A18; --line: #252B28; --line-2: #343C38;
  --fg: #E8ECE9; --muted: #A0A9A3; --faint: #6D7671;
  --tomato: oklch(70.5% .189 34.3); --leaf: oklch(73.9% .132 162.8); --sky: oklch(72.2% .116 252.5);
  --shadow: 0 0 0 1px rgb(255 255 255 / .05);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 46rem; margin: 0 auto; padding: 48px 16px 64px; }
a { color: inherit; text-underline-offset: 3px; text-decoration-color: var(--line-2); }
a:hover { text-decoration-color: currentColor; }
.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 550; color: var(--muted); text-decoration: none; }
.brand svg { width: 17px; height: 17px; }
h1 { font: 650 34px/1.1 "Bricolage Grotesque", "Geist", system-ui, sans-serif; letter-spacing: -.03em; margin: 20px 0 6px; }
.sub { margin: 0; color: var(--muted); font-size: 14px; }
section { margin-top: 36px; }
h2 { font-size: 13px; font-weight: 550; color: var(--muted); margin: 0 0 10px; }
.card, .tile { background: var(--surface); border-radius: 14px; box-shadow: var(--shadow); }
.card { padding: 16px 18px; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.tile { display: flex; flex-direction: column; padding: 14px 16px 15px; min-width: 0; }
.k { font-size: 13px; color: var(--muted); }
.v { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 4px; font-size: 28px; font-weight: 600; letter-spacing: -.02em; line-height: 1.15; }
em { font-style: normal; font-size: 12.5px; font-weight: 550; letter-spacing: 0; color: var(--faint); }
em.up { color: var(--leaf); }
em.down { color: var(--tomato); }
.f { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.f2 { font-size: 12.5px; color: var(--faint); }
.chart { position: relative; padding-top: 32px; }
.sum, .b::after { position: absolute; top: 0; left: 0; font-size: 12.5px; line-height: 18px; white-space: pre; transition: opacity .12s; }
.sum { color: var(--faint); }
.chart:has(.b:hover) .sum { opacity: 0; }
.max { position: absolute; top: 13px; right: 0; font-size: 11.5px; line-height: 18px; color: var(--faint); font-variant-numeric: tabular-nums; }
.bars { display: flex; align-items: flex-end; gap: 2px; height: 128px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line-2); }
.b { flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; }
.b i { display: block; width: 100%; max-width: 14px; border-radius: 4px 4px 0 0; background: var(--sky); transition: opacity .15s; }
.b.now i { background: color-mix(in oklab, var(--sky) 45%, var(--surface)); }
.bars:hover .b i { opacity: .4; }
.bars:hover .b:hover i { opacity: 1; }
.b::after { content: attr(data-tip); color: var(--fg); opacity: 0; pointer-events: none; }
.b:hover::after { opacity: 1; }
.none { position: absolute; top: 32px; left: 0; right: 0; height: 128px; display: grid; place-items: center; font-size: 13px; color: var(--faint); }
.x { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11.5px; color: var(--faint); }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
th { font-size: 12px; font-weight: 500; color: var(--faint); text-align: right; padding: 0 0 8px 14px; white-space: nowrap; }
td { text-align: right; padding: 7px 0 7px 14px; border-top: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; padding-left: 0; }
td small { display: inline-block; min-width: 3.4em; margin-left: 6px; font-size: 12px; color: var(--faint); }
td.z { color: var(--faint); }
td.r { color: var(--muted); }
td:first-child small { margin: 0; min-width: 0; }
tr.grp td:first-child { font-weight: 500; }
tr.sub td { border-top-color: transparent; padding-top: 3px; padding-bottom: 3px; }
tr.sub td:first-child { padding-left: 14px; color: var(--muted); }
tr.sub + tr.grp td { padding-top: 9px; }
tr.sub:has(+ tr.grp) td { padding-bottom: 9px; }
.scroll { overflow-x: auto; margin: 0 -18px; padding: 0 18px; }
footer { margin-top: 32px; font-size: 12.5px; line-height: 1.55; color: var(--faint); max-width: 36rem; }
@media (max-width: 640px) {
  main { padding-top: 32px; }
  h1 { font-size: 28px; }
  .tiles { grid-template-columns: 1fr 1fr; }
  .card { padding: 14px 14px; }
  .scroll { margin: 0 -14px; padding: 0 14px; }
  td small { min-width: 0; }
  td, th { padding-left: 10px; }
  .days th { white-space: normal; vertical-align: bottom; }
  .days td:first-child :is(small, .mo) { display: none; }
  .b::after { display: none; }
}
`;

export class Counts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS hits (day TEXT NOT NULL, page TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, page, event))");
  }

  add(page, event) {
    this.sql.exec("INSERT INTO hits (day, page, event, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, page, event) DO UPDATE SET n = n + 1", utcDay(Date.now()), page, event);
  }

  since(day) {
    return this.sql.exec("SELECT day, page, event, n FROM hits WHERE day >= ?", day).toArray();
  }
}
