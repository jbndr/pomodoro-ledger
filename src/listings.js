import { CSS, ownerOnly } from "./hits.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName("lobby"));
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const date = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function listings(request, env, url) {
  const denied = await ownerOnly(request, env);
  if (denied) return denied;
  if (request.method === "POST") {
    // Access lets the cookie through on any POST, so only this page's own forms count.
    if (request.headers.get("Origin") !== url.origin) return json({ error: "forbidden" }, 403);
    const f = await request.formData();
    await lobby(env).fetch("https://lobby/admin", { method: "POST", body: JSON.stringify({ action: f.get("action"), kind: f.get("kind"), id: f.get("id") }) });
    return new Response(null, { status: 303, headers: { location: url.pathname, "cache-control": "no-store" } });
  }
  const data = await (await lobby(env).fetch("https://lobby/admin")).json();
  if (url.searchParams.get("format") === "json") return json(data);
  return new Response(render(data), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function days(list) {
  const set = [...list].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Mon–Fri";
  return set.map((d) => DAYS[d]).join(", ");
}

function state(x) {
  if (x.mod === "hide") return '<span class="st off">Hidden by you</span>';
  if (x.hidden) return '<span class="st off">Hidden by reports</span>';
  if (x.mod === "show") return '<span class="st">Kept by you</span>';
  return '<span class="st">Listed</span>';
}

const button = (action, kind, id, label, confirm) =>
  `<form method="post"${confirm ? ` onsubmit="return confirm('${esc(confirm)}')"` : ""}><input type="hidden" name="action" value="${action}"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${esc(id)}"><button${action === "remove" ? ' class="danger"' : ""}>${label}</button></form>`;
const toggle = (kind, id, x) => (x.hidden ? button("show", kind, id, "Show") : button("hide", kind, id, "Hide"));

function schedules(list) {
  if (!list.length) return '<p class="empty">Nobody has scheduled a session.</p>';
  return `<div class="scroll"><table><thead><tr><th>Session</th><th>When</th><th>Made</th><th>Reports</th><th></th><th></th></tr></thead><tbody>${list.map((s) => `<tr${s.hidden ? ' class="dim"' : ""}>
<td><b>${esc(s.title)}</b><small>${esc(s.rhythm)} · up to ${s.max}</small></td>
<td>${days(s.days)} ${hm(s.from)}–${hm(s.to)}<small>${esc(s.tz)}</small></td>
<td>${date(s.at)}</td><td class="${s.reports ? "warn" : "z"}">${s.reports}</td><td>${state(s)}</td>
<td><div class="acts">${toggle("s", s.id, s)}${button("remove", "s", s.id, "Remove", "Remove “" + s.title + "” for everyone? Its reminders stop too.")}</div></td></tr>`).join("")}</tbody></table></div>`;
}

function rooms(list) {
  if (!list.length) return '<p class="empty">No public rooms are open right now.</p>';
  return `<div class="scroll"><table><thead><tr><th>Room</th><th>People</th><th>Reports</th><th></th><th></th></tr></thead><tbody>${list.map((r) => `<tr${r.hidden ? ' class="dim"' : ""}>
<td><b>${esc(r.title)}</b><small>${esc(r.rhythm)}</small></td><td>${r.people}</td><td class="${r.reports ? "warn" : "z"}">${r.reports}</td><td>${state(r)}</td>
<td><div class="acts">${toggle("r", r.code, r)}</div></td></tr>`).join("")}</tbody></table></div>`;
}

function render(data) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Listings</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts/fonts.css">
<script>try { const t = JSON.parse(localStorage.getItem("pl.theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}</script>
<style>${CSS}${PAGE_CSS}</style>
</head>
<body>
<main>
<header>
<a class="brand" href="/"><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="5.6" cy="14" r="4.5" fill="var(--tomato)"/><path d="M13.04 20.96L22.16 7.76" fill="none" stroke="var(--leaf)" stroke-width="6" stroke-linecap="round"/></svg>Pomodoro Ledger</a>
<h1>Listings</h1>
<p class="sub">What anyone sees under Work together. Three reports from different people hide a listing until you look at it. <a href="?format=json">JSON</a></p>
</header>
<section><h2>Scheduled sessions</h2><div class="card">${schedules(data.schedules)}</div></section>
<section><h2>Public rooms open now</h2><div class="card">${rooms(data.rooms)}</div></section>
<footer>Hide takes a listing off the list for everyone and keeps it hidden whatever the reports say; Show keeps it listed. Remove deletes a scheduled session and its reminders. A public room closes on its own ten minutes after everyone leaves. Reports keep no addresses, only a hash per person and listing, and go a week after the listing does.</footer>
</main>
</body>
</html>`;
}

const PAGE_CSS = `
td b { font-weight: 550; }
td small { display: block; min-width: 0; margin: 1px 0 0; }
td { vertical-align: top; }
td:first-child { white-space: normal; min-width: 12em; }
td.warn { color: var(--tomato); font-weight: 600; }
tr.dim td:not(:last-child) { opacity: .55; }
.st { font-size: 12.5px; color: var(--muted); }
.st.off { color: var(--tomato); }
.acts { display: flex; justify-content: flex-end; gap: 6px; }
.acts form { margin: 0; }
.acts button { font: inherit; font-size: 12.5px; font-weight: 550; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface); color: var(--fg); cursor: pointer; }
.acts button:hover { background: var(--bg); }
.acts button.danger { color: var(--tomato); }
.empty { margin: 0; font-size: 13.5px; color: var(--faint); }
`;
