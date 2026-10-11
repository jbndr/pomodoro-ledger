import { DurableObject } from "cloudflare:workers";
import { hit, stats } from "./hits.js";
import { listings } from "./listings.js";
import { pushBody, pushReady, readSub, sendPush } from "./push.js";
import { handleSync } from "./sync.js";
import { handleHere } from "./here.js";
import { handleWeather } from "./weather.js";
import { isZone, nextSession, readTimes, scheduleOf, sessionCode, startStep, weekStart } from "../web/src/lib/schedule.ts";
import { CREW_MAX, isCrewRoom } from "../web/src/lib/crew.ts";

export { Ledger } from "./sync.js";
export { Counts } from "./hits.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MODES = ["focus", "short", "long"];
const STATUSES = ["idle", "running", "paused"];
const MAX_MEMBERS = 12;
const MIN_MEMBERS = 2;
const MAX_RUN_MS = 4 * 3600000;
const PROPOSAL_MS = 30000;
const COOLDOWN_MS = 60000;
const EMPTY_MS = 10 * 60000;
const HEARTBEAT_MS = 5 * 60000;
const LISTED_MS = 12 * 60000;
const RHYTHMS = ["25/5", "50/10"];
const REACTIONS = ["👋", "🎉", "🔥", "👍", "☕"];
const REACT_BURST = 5;
const REACT_EVERY_MS = 4000;
const SIGNALS = ["deep", "stuck", "back", "wrap"];
const SIG_BURST = 4;
const SIG_EVERY_MS = 3000;
const GOAL_MAX = 99;
const MIN_ROUND_MS = 5 * 60000;
const ROUND_SLACK_MS = 30000;
const ROUND_GAP_MS = 4 * 60000;
const SCHEDULES = 50;
const SCHED_IDLE_MS = 21 * 24 * 3600000;
const SCHED_BURST = 3;
const SCHED_EVERY_MS = 20 * 60000;
const GOING_BURST = 10;
const GOING_EVERY_MS = 30000;
const GOING_MAX = 99;
const EARLY_MS = 60000;
const PUSH_PER_SCHED = 40;
const PUSH_TOTAL = 1000;
const PUSH_BURST = 10;
const PUSH_EVERY_MS = 60000;
const PUSH_LATE_MS = 5 * 60000;
const PUSH_TTL_S = 3600;
const REPORTS_TO_HIDE = 3;
const REPORT_BURST = 5;
const REPORT_EVERY_MS = 10 * 60000;
const REPORT_KEEP_MS = 7 * 24 * 3600000;
const CREW_NAME = 32;
const CREW_IDLE_MS = 90 * 24 * 3600000;
const CREW_FRESH_MS = 24 * 3600000;
const CREW_BURST = 3;
const CREW_EVERY_MS = 20 * 60000;
const HOUSE = [{ key: "P", rhythm: "25/5", title: "Pomodoro" }, { key: "D", rhythm: "50/10", title: "Deep work" }];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const pick = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHABET[x % ALPHABET.length]).join("");
const room = (env, code) => env.ROOM.get(env.ROOM.idFromName(code));
const crew = (env, code) => env.CREW.get(env.CREW.idFromName(code));
const ms = (v) => Math.max(0, Math.min(MAX_RUN_MS, Math.round(Number(v) || 0)));
const clean = (v, n) => String(v || "").replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
// A token bucket per member: a short burst, then one reaction every few seconds.
const tokens = (b, now, burst = REACT_BURST, every = REACT_EVERY_MS) => (b ? Math.min(burst, b.n + (now - b.at) / every) : burst);
const size = (v) => { const n = Math.round(Number(v ?? MAX_MEMBERS)); return Number.isFinite(n) ? Math.max(MIN_MEMBERS, Math.min(MAX_MEMBERS, n)) : MAX_MEMBERS; };
const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName("lobby"));
// Enough reports from different people hide a listing until you look at it; your call ("hide" or "show") overrides them.
const hiddenBy = (rep) => !!rep && (rep.mod === "hide" || (rep.mod !== "show" && rep.by.length >= REPORTS_TO_HIDE));
// Who reported is kept only as a hash of their address and the listing, so the same person counts once.
const reporter = async (ip, key) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + key)))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
const goalOf = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(GOAL_MAX, n) : null; };
// A focus round that ran to its end (not skipped or paused) and was long enough to be one.
const roundDone = (was, s, now) => !!was && was.mode === "focus" && was.status === "running" && was.total >= MIN_ROUND_MS && was.end - now <= ROUND_SLACK_MS && s.mode !== "focus";
// When subscribers are next owed a push: the next start, or now if a session just began unannounced.
function pushAt(s, now) {
  const o = nextSession(s, now);
  if (!o) return null;
  if (o.start > now) return o.start;
  if (s.pushed !== o.start && now - o.start < PUSH_LATE_MS) return now;
  const n = nextSession(s, o.end);
  return n && n.start;
}
const CARD_ALT = "A room bar with four people's timers, a shared goal of 12 rounds and quick reactions";
// What a room invite shows when it's pasted into a chat: the room's name and rhythm when it's public, never who's in it or anyone's tasks.
function inviteMeta(cfg) {
  if (!cfg) return { title: "Join my focus room", description: "Focus together on Pomodoro Ledger. You see each other's timers, never each other's tasks.", image: "/og-room.png" };
  const deep = cfg.rhythm === "50/10";
  return {
    title: cfg.title + " · a focus room",
    description: (deep ? "50 minutes of deep work, 10 of break" : "25 minutes of focus, 5 of break") + ", on the room's clock. Drop in with just a name; your tasks stay private.",
    image: deep ? "/og-room-50.png" : "/og-room-25.png",
  };
}

async function roomMeta(env, code) {
  let cfg = houseRoom(code);
  try {
    if (!cfg) cfg = await (await room(env, code).fetch("https://room/info")).json();
    const id = !cfg && scheduleOf(code);
    if (id) { const res = await lobby(env).fetch("https://lobby/schedule/" + id); cfg = res.ok ? await res.json() : null; }
  } catch {}
  return inviteMeta(cfg);
}

async function crewMeta(env, code) {
  let name = "";
  try { const res = await crew(env, code).fetch("https://crew/info"); if (res.ok) name = (await res.json()).name; } catch {}
  return {
    title: name ? "Join " + name + ", a focus crew" : "Join my focus crew",
    description: "A standing room for up to " + CREW_MAX + " people, with the rounds you finish counted together each week. You see each other's timers, never each other's tasks.",
    image: "/og-room.png",
  };
}

async function invitePage(request, env, url, meta, link) {
  // The rewriter escapes quotes but leaves ampersands as they are.
  const set = (v) => ({ element: (e) => e.setAttribute("content", v.replace(/&/g, "&amp;")) });
  const page = await env.ASSETS.fetch(request);
  const res = new HTMLRewriter()
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[property="og:url"]', set(url.origin + link))
    .on('meta[property="og:image"], meta[name="twitter:image"]', set(url.origin + meta.image))
    .on('meta[property="og:image:alt"], meta[name="twitter:image:alt"]', set(CARD_ALT))
    .transform(page);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-cache");
  headers.delete("etag");
  return new Response(res.body, { status: res.status, headers });
}

// House rooms are always listed. Their codes contain an O, which random codes never do.
const houseCode = (h, i) => "OPEN" + h.key + ALPHABET[i];
function houseRoom(code) {
  if (code.length !== 6) return null;
  for (const h of HOUSE) {
    const i = ALPHABET.indexOf(code.slice(5));
    if (code.slice(0, 5) === "OPEN" + h.key && i >= 0) return { pub: true, house: true, code, rhythm: h.rhythm, title: h.title + (i ? " " + (i + 1) : ""), max: MAX_MEMBERS };
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Links shared before the app moved to /app/ (invites, sync return, demo) keep working.
    if (url.pathname === "/" && /[?&](room|synced|demo)(=|&|$)/.test(url.search)) return Response.redirect(url.origin + "/app/" + url.search, 302);
    const code = (k) => String(url.searchParams.get(k) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (url.pathname === "/app/" && request.method === "GET") {
      const r = code("room"), c = code("crew");
      if (r.length === 6) return invitePage(request, env, url, await roomMeta(env, r), "/app/?room=" + r);
      if (/^[A-HJKMNP-Z2-9]{8}$/.test(c)) return invitePage(request, env, url, await crewMeta(env, c), "/app/?crew=" + c);
    }
    if (url.pathname === "/api/rooms" && request.method === "GET") return lobby(env).fetch("https://lobby/rooms");
    if (url.pathname === "/api/here" && request.method === "GET") return handleHere(request);
    if (url.pathname === "/api/weather" && request.method === "GET") return handleWeather(request);
    if (url.pathname === "/api/push" && request.method === "GET") return json({ key: pushReady(env) ? env.VAPID_PUBLIC_KEY.trim() : null });
    if (url.pathname === "/api/room" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      let cfg = null;
      if (body && body.pub) {
        cfg = { pub: true, house: false, title: clean(body.title, 32), rhythm: body.rhythm, max: size(body.max), goal: goalOf(body.goal) };
        if (!cfg.title || !RHYTHMS.includes(cfg.rhythm)) return json({ error: "bad room" }, 400);
      }
      for (let i = 0; i < 5; i++) {
        const code = pick(6);
        const ownerToken = crypto.randomUUID();
        const res = await room(env, code).fetch("https://room/open", { method: "POST", body: JSON.stringify({ ownerToken, cfg: cfg && { ...cfg, code }, goal: cfg ? null : goalOf(body && body.goal) }) });
        if (res.ok) return json({ code, ownerToken });
      }
      return json({ error: "busy" }, 503);
    }
    if (url.pathname === "/api/crew" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "local", body = await request.json().catch(() => null);
      const name = clean(body && body.name, CREW_NAME), tz = body && body.tz;
      if (!name || !isZone(tz)) return json({ error: "bad crew" }, 400);
      if ((await lobby(env).fetch("https://lobby/spend", { method: "POST", headers: { "x-ip": ip } })).status !== 204) return json({ error: "slow down" }, 429);
      for (let i = 0; i < 5; i++) {
        const code = pick(8), res = await crew(env, code).fetch("https://crew/open", { method: "POST", body: JSON.stringify({ name, tz, room: "I" + pick(5) }) });
        if (res.ok) return json({ code });
      }
      return json({ error: "busy" }, 503);
    }
    const cm = url.pathname.match(/^\/api\/crew\/([A-HJKMNP-Z2-9]{8})(\/ws|\/push)?$/);
    if (cm) {
      if (cm[2] === "/ws") {
        if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
        const origin = request.headers.get("Origin");
        if (origin && new URL(origin).host !== url.host) return json({ error: "forbidden" }, 403);
        return crew(env, cm[1]).fetch(request);
      }
      if (cm[2] === "/push" && (request.method === "POST" || request.method === "DELETE")) return crew(env, cm[1]).fetch("https://crew/push", { method: request.method, body: await request.text() });
      if (!cm[2] && request.method === "GET") return crew(env, cm[1]).fetch("https://crew/info");
    }
    if (url.pathname === "/api/report" && request.method === "POST") {
      return lobby(env).fetch("https://lobby/report", { method: "POST", headers: { "x-ip": request.headers.get("CF-Connecting-IP") || "local" }, body: await request.text() });
    }
    if (url.pathname === "/api/schedule" || url.pathname.startsWith("/api/schedule/")) {
      const headers = { "x-ip": request.headers.get("CF-Connecting-IP") || "local" };
      return lobby(env).fetch("https://lobby" + url.pathname.slice(4), { method: request.method, headers, body: request.method === "GET" ? undefined : await request.text() });
    }
    const m = url.pathname.match(/^\/api\/room\/([A-Z2-9]{6})\/ws$/);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
      const origin = request.headers.get("Origin");
      if (origin && new URL(origin).host !== url.host) return json({ error: "forbidden" }, 403);
      return room(env, m[1]).fetch(request);
    }
    if (url.pathname === "/api/hit") return hit(request, env, url, ctx);
    if (url.pathname === "/api/sync/stats") return stats(request, env, url);
    if (url.pathname === "/api/sync/listings") return listings(request, env, url);
    if (url.pathname === "/api/sync" || url.pathname.startsWith("/api/sync/")) return handleSync(request, env, url);
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const store = this.ctx.storage, path = new URL(request.url).pathname;
    if (path === "/info") {
      const cfg = await store.get("cfg");
      return json(cfg ? { title: cfg.title, rhythm: cfg.rhythm } : null);
    }
    if (path === "/open") {
      if (await store.get("open")) return new Response(null, { status: 409 });
      const { ownerToken, cfg, goal } = await request.json();
      await store.put("open", Date.now());
      await store.put("ownerToken", ownerToken);
      if (cfg) await store.put("cfg", cfg);
      if (goal) await store.put("goal", goal);
      await store.setAlarm(Date.now() + EMPTY_MS);
      return new Response(null, { status: 204 });
    }
    const code = path.split("/")[3] || "";
    if (!(await store.get("open"))) {
      const cfg = houseRoom(code) || (scheduleOf(code) && (await this.session(code)));
      // A crew's room is a private room without an owner that opens whenever a member comes in.
      if (cfg || isCrewRoom(code)) {
        await store.put("open", Date.now());
        if (cfg) await store.put("cfg", cfg);
        await store.setAlarm(Date.now() + EMPTY_MS);
      }
    }
    const [client, server] = Object.values(new WebSocketPair());
    if (await store.get("open")) this.ctx.acceptWebSocket(server);
    else {
      server.accept();
      server.close(4004, "No such room");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // A scheduled session's room opens itself while the session is on.
  async session(code) {
    try {
      const res = await lobby(this.env).fetch("https://lobby/session/" + code);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  members(except) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => ({ ws, a: ws.deserializeAttachment() }))
      .filter((x) => x.a && x.a.id);
  }

  send(ws, body) {
    try { ws.send(JSON.stringify(body)); } catch {}
  }

  note(msg, except) {
    for (const { ws } of this.members(except)) this.send(ws, { t: "note", msg });
  }

  async broadcast(except) {
    const store = this.ctx.storage, all = this.members(except), prop = (await store.get("prop")) || null, now = Date.now();
    const cfg = await store.get("cfg"), pub = cfg ? { title: cfg.title, rhythm: cfg.rhythm, house: cfg.house, max: cfg.max || MAX_MEMBERS } : null;
    const target = cfg ? cfg.goal || null : (await store.get("goal")) || null, goal = { n: target, done: (await store.get("done")) || 0 };
    const members = all.map(({ a }) => ({ id: a.pub, name: a.name, s: a.s, owner: !!a.owner, sig: a.sig || null }));
    for (const { ws, a } of all) this.send(ws, { t: "room", now, you: a.pub, owner: !!a.owner, members, prop, pub, goal });
  }

  // Tells the lobby who's in a public room; an empty room drops off the list.
  async report(except) {
    const cfg = await this.ctx.storage.get("cfg");
    if (!cfg) return;
    const names = this.members(except).map((x) => x.a.name);
    try {
      await lobby(this.env).fetch("https://lobby/rooms", { method: "POST", body: JSON.stringify({ code: cfg.code, title: cfg.title, rhythm: cfg.rhythm, house: cfg.house, max: cfg.max || MAX_MEMBERS, names }) });
    } catch {}
  }

  // Applies the request once every member present has accepted.
  async settle(prop, except) {
    const store = this.ctx.storage, all = this.members(except), by = all.find((x) => x.a.pub === prop.by);
    if (!by || !by.a.s || all.length < 2) return store.delete("prop");
    if (!all.every((x) => prop.yes.includes(x.a.pub))) return store.put("prop", prop);
    await store.delete("prop");
    const s = by.a.s, idle = s.status === "idle";
    const remaining = idle ? s.total : s.status === "running" ? s.end - Date.now() : s.rem;
    if (remaining < 5000) return this.note("That timer just ended, so there was nothing to sync to.", except);
    const body = { t: "sync", by: prop.by, name: by.a.name, s: { mode: s.mode, status: idle ? "running" : s.status, remaining, total: s.total } };
    for (const { ws } of all) this.send(ws, body);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 600) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    const store = this.ctx.storage, now = Date.now(), me = ws.deserializeAttachment();

    if (m.t === "hello") {
      if (me) return;
      const id = String(m.id || "").slice(0, 40), name = clean(m.name, 20);
      if (!id || !name) return ws.close(4000, "Bad hello");
      const others = [];
      let rb = null, sig = null, lr = 0;
      for (const x of this.members(ws)) {
        if (x.a.id !== id) { others.push(x); continue; }
        rb = x.a.rb || null; sig = x.a.sig || null; lr = x.a.lr || 0;
        x.ws.serializeAttachment(null);
        x.ws.close(4001, "Replaced");
      }
      const ownerToken = await store.get("ownerToken"), cfg = await store.get("cfg");
      if (others.length >= ((cfg && cfg.max) || MAX_MEMBERS)) return ws.close(4003, "Room is full");
      const owner = !cfg && !!ownerToken && m.ownerToken === ownerToken;
      ws.serializeAttachment({ id, pub: pick(8), name, s: null, asked: 0, owner, rb, sig, lr });
      await this.broadcast();
      if (!cfg) return;
      await store.setAlarm(now + HEARTBEAT_MS);
      return this.report();
    }
    if (!me) return;

    if (m.t === "react") {
      if (!REACTIONS.includes(m.e)) return;
      const n = tokens(me.rb, now);
      if (n < 1) {
        if (me.rb.hushed) return;
        me.rb.hushed = true;
        ws.serializeAttachment(me);
        return this.send(ws, { t: "note", msg: "Easy there. Your reactions are paused for a few seconds." });
      }
      me.rb = { n: n - 1, at: now };
      ws.serializeAttachment(me);
      for (const x of this.members(ws)) this.send(x.ws, { t: "react", by: me.pub, name: me.name, e: m.e });
      return;
    }

    if (m.t === "sig") {
      if (m.k !== null && !SIGNALS.includes(m.k)) return;
      const n = tokens(me.sb, now, SIG_BURST, SIG_EVERY_MS);
      if (n < 1) return;
      me.sb = { n: n - 1, at: now };
      me.sig = m.k && { k: m.k, at: now };
      ws.serializeAttachment(me);
      return this.broadcast();
    }

    // Public rooms follow the room clock: nobody owns them and there's nothing to vote on.
    if (m.t !== "state" && (await store.get("cfg"))) return;

    if (m.t === "goal") {
      if (!me.owner) return;
      const n = tokens(me.gb, now, SIG_BURST, SIG_EVERY_MS);
      if (n < 1) return;
      me.gb = { n: n - 1, at: now };
      ws.serializeAttachment(me);
      const goal = goalOf(m.n);
      if (goal) await store.put("goal", goal); else await store.delete("goal");
      return this.broadcast();
    }

    if (m.t === "kick") {
      if (!me.owner) return;
      const target = this.members(ws).find((x) => x.a.pub === m.id && !x.a.owner);
      if (!target) return;
      await this.left(target.ws);
      target.ws.serializeAttachment(null);
      target.ws.close(4005, "Removed by room creator");
      return;
    }

    if (m.t === "state") {
      const s = m.s || {};
      if (!MODES.includes(s.mode) || !STATUSES.includes(s.status)) return;
      const rem = ms(s.remaining), was = me.s;
      me.s = { mode: s.mode, status: s.status, total: ms(s.total), rem, end: s.status === "running" ? now + rem : 0 };
      if (roundDone(was, me.s, now) && now - (me.lr || 0) >= ROUND_GAP_MS) {
        me.lr = now;
        await store.put("done", ((await store.get("done")) || 0) + 1);
      }
      ws.serializeAttachment(me);
      return this.broadcast();
    }

    if (m.t === "propose") {
      if (!me.s) return;
      if (this.members().length < 2) return this.send(ws, { t: "note", msg: "Nobody else is here yet." });
      if (await store.get("prop")) return this.send(ws, { t: "note", msg: "A sync request is already open." });
      if (now - me.asked < COOLDOWN_MS) return this.send(ws, { t: "note", msg: "Give it a minute before asking again." });
      me.asked = now;
      ws.serializeAttachment(me);
      await store.put("prop", { by: me.pub, yes: [me.pub], ends: now + PROPOSAL_MS });
      await store.setAlarm(now + PROPOSAL_MS);
      return this.broadcast();
    }

    const prop = await store.get("prop");
    if (!prop) return;
    if (m.t === "cancel" && prop.by === me.pub) {
      await store.delete("prop");
      return this.broadcast();
    }
    if (m.t === "vote" && prop.by !== me.pub) {
      if (m.ok) {
        if (!prop.yes.includes(me.pub)) prop.yes.push(me.pub);
        await this.settle(prop);
      } else {
        await store.delete("prop");
        this.note(me.name + " declined, so timers stay as they are.", ws);
      }
      return this.broadcast();
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000); } catch {}
    await this.left(ws);
  }

  async webSocketError(ws) {
    await this.left(ws);
  }

  async left(ws) {
    const store = this.ctx.storage, gone = ws.deserializeAttachment();
    if (!gone || !gone.id) return;
    await this.report(ws);
    if (!this.members(ws).length) {
      await store.delete("prop");
      return store.setAlarm(Date.now() + EMPTY_MS);
    }
    const prop = await store.get("prop");
    if (prop && prop.by === gone.pub) await store.delete("prop");
    else if (prop) await this.settle(prop, ws);
    await this.broadcast(ws);
  }

  async alarm() {
    const store = this.ctx.storage, cfg = await store.get("cfg");
    if (!this.members().length) return store.deleteAll();
    if (cfg) {
      await this.report();
      return store.setAlarm(Date.now() + HEARTBEAT_MS);
    }
    const prop = await store.get("prop");
    if (!prop || Date.now() < prop.ends) return;
    await store.delete("prop");
    this.note("Not everyone answered in time, so timers stay as they are.");
    await this.broadcast();
  }
}

// Lists the public rooms people are in, an open house room for every rhythm, and scheduled sessions.
export class Lobby extends DurableObject {
  async fetch(request) {
    const store = this.ctx.storage, now = Date.now(), path = new URL(request.url).pathname;
    if (path.startsWith("/session/")) return this.session(path.slice(9), now);
    if (path === "/report") return this.report(request, now);
    if (path === "/spend") return new Response(null, { status: (await this.spend("ip:c:" + (request.headers.get("x-ip") || "local"), CREW_BURST, CREW_EVERY_MS, now)) ? 204 : 429 });
    if (path === "/admin") return this.admin(request, now);
    if (path === "/schedule" || path.startsWith("/schedule/")) return this.schedule(request, path, now);
    if (request.method === "POST") {
      const r = await request.json();
      if (r.names.length) await store.put("r:" + r.code, { ...r, at: now });
      else await store.delete("r:" + r.code);
      const id = scheduleOf(r.code), s = id && r.names.length && (await store.get("s:" + id));
      if (s) await store.put("s:" + id, { ...s, used: now });
      return new Response(null, { status: 204 });
    }
    const rooms = [], upcoming = [], stale = [], reported = await store.list({ prefix: "r:" }), schedules = await store.list({ prefix: "s:" }), reps = await store.list({ prefix: "rep:" });
    const hidden = (kind, id) => hiddenBy(reps.get("rep:" + kind + ":" + id));
    for (const [k, r] of reported) {
      if (now - r.at > LISTED_MS) stale.push(k);
      else if (!scheduleOf(r.code) && !hidden("r", r.code)) rooms.push({ code: r.code, title: r.title, rhythm: r.rhythm, house: r.house, max: r.max || MAX_MEMBERS, names: r.names });
    }
    for (const [k, rep] of reps) {
      const [, kind, id] = k.split(":");
      if (now - rep.at > REPORT_KEEP_MS && !(kind === "s" ? schedules : reported).has(kind + ":" + id)) stale.push(k);
    }
    const gone = [];
    for (const [k, s] of schedules) {
      const o = nextSession(s, now);
      if (now - s.used > SCHED_IDLE_MS || !o) { stale.push(k); gone.push(s.id); continue; }
      if (hidden("s", s.id)) continue;
      const going = s.going && s.going.at === o.start ? s.going.ids.length : 0;
      if (o.start > now) { upcoming.push({ id: s.id, title: s.title, rhythm: s.rhythm, max: s.max, tz: s.tz, days: s.days, from: s.from, to: s.to, start: o.start, end: o.end, going }); continue; }
      const code = sessionCode(s.id, o.start), r = reported.get("r:" + code);
      rooms.push({ code, title: s.title, rhythm: s.rhythm, house: false, max: s.max, names: r && now - r.at <= LISTED_MS ? r.names : [], sched: s.id, ends: o.end });
    }
    for (const [k, b] of await store.list({ prefix: "ip:" })) if (now >= b.full) stale.push(k);
    if (stale.length) await store.delete(stale);
    if (gone.length) await this.unsubscribe(gone, now);
    else if (pushReady(this.env) && (await store.getAlarm()) == null) await this.arm(now);
    upcoming.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
    for (const h of HOUSE) {
      const shards = rooms.filter((r) => r.house && r.rhythm === h.rhythm);
      if (shards.some((r) => r.names.length < r.max)) continue;
      let i = 0;
      while (i < ALPHABET.length && shards.some((r) => r.code === houseCode(h, i))) i++;
      if (i < ALPHABET.length) rooms.push({ ...houseRoom(houseCode(h, i)), names: [] });
    }
    return json({ now, rooms: rooms.map(({ pub, ...r }) => r), upcoming });
  }

  // The room config for a session that's on now, so its room can open itself.
  async session(code, now) {
    const id = scheduleOf(code), s = id && (await this.ctx.storage.get("s:" + id)), o = s && nextSession(s, now);
    if (!o || o.start > now + EARLY_MS || sessionCode(id, o.start) !== code) return json({ error: "not on" }, 404);
    return json({ pub: true, house: false, code, title: s.title, rhythm: s.rhythm, max: s.max, sched: id });
  }

  // Anyone can report a listing once; `on: false` takes their report back.
  async report(request, now) {
    const store = this.ctx.storage, ip = request.headers.get("x-ip") || "local", body = (await request.json().catch(() => null)) || {};
    const kind = body.kind, id = String(body.id || "");
    if (!(kind === "s" ? /^[A-Z2-9]{3}$/ : kind === "r" ? /^[A-Z2-9]{6}$/ : /^$/).test(id)) return json({ error: "bad request" }, 400);
    const subject = await store.get(kind + ":" + id);
    if (!subject || subject.house) return json({ error: "not found" }, 404);
    if (!(await this.spend("ip:x:" + ip, REPORT_BURST, REPORT_EVERY_MS, now))) return json({ error: "slow down" }, 429);
    const key = "rep:" + kind + ":" + id, rep = (await store.get(key)) || { by: [] }, who = await reporter(ip, key);
    const by = rep.by.filter((x) => x !== who);
    if (body.on !== false) by.push(who);
    await store.put(key, { ...rep, by, at: now });
    return new Response(null, { status: 204 });
  }

  // For the owner's listings page: every schedule and public room with its reports, and removing, hiding or showing one.
  async admin(request, now) {
    const store = this.ctx.storage, reps = await store.list({ prefix: "rep:" });
    const flags = (kind, id) => { const rep = reps.get("rep:" + kind + ":" + id); return { reports: rep ? rep.by.length : 0, hidden: hiddenBy(rep), mod: (rep && rep.mod) || null }; };
    if (request.method === "GET") {
      const schedules = [...(await store.list({ prefix: "s:" })).values()].map((s) => ({ id: s.id, title: s.title, rhythm: s.rhythm, max: s.max, tz: s.tz, days: s.days, from: s.from, to: s.to, at: s.at, used: s.used, ...flags("s", s.id) }));
      const rooms = [...(await store.list({ prefix: "r:" })).values()].filter((r) => !r.house && !scheduleOf(r.code) && now - r.at <= LISTED_MS).map((r) => ({ code: r.code, title: r.title, rhythm: r.rhythm, people: r.names.length, ...flags("r", r.code) }));
      return json({ now, schedules: schedules.sort((a, b) => b.reports - a.reports || b.at - a.at), rooms: rooms.sort((a, b) => b.reports - a.reports) });
    }
    const { action, kind, id } = (await request.json().catch(() => null)) || {};
    if (!["remove", "hide", "show"].includes(action) || !["s", "r"].includes(kind) || typeof id !== "string") return json({ error: "bad request" }, 400);
    const key = "rep:" + kind + ":" + id;
    if (action === "remove") {
      if (kind !== "s" || !(await store.get("s:" + id))) return json({ error: "not found" }, 404);
      await store.delete(["s:" + id, key]);
      await this.unsubscribe([id], now);
    } else await store.put(key, { by: [], ...reps.get(key), mod: action, at: now });
    return new Response(null, { status: 204 });
  }

  // A token bucket per client address, kept until it has refilled.
  async spend(key, burst, every, now) {
    const store = this.ctx.storage, n = tokens(await store.get(key), now, burst, every);
    if (n < 1) return false;
    await store.put(key, { n: n - 1, at: now, full: now + (burst - n + 1) * every });
    return true;
  }

  async schedule(request, path, now) {
    const store = this.ctx.storage, ip = request.headers.get("x-ip") || "local", body = (await request.json().catch(() => null)) || {};
    const [, , id, going] = path.split("/");
    if (!id && request.method === "POST") {
      const times = readTimes(body), title = clean(body.title, 32);
      if (!times || !title || !RHYTHMS.includes(body.rhythm) || times.from % startStep(body.rhythm)) return json({ error: "bad schedule" }, 400);
      if (!(await this.spend("ip:s:" + ip, SCHED_BURST, SCHED_EVERY_MS, now))) return json({ error: "slow down" }, 429);
      const all = await store.list({ prefix: "s:" });
      if ([...all.values()].filter((s) => now - s.used <= SCHED_IDLE_MS).length >= SCHEDULES) return json({ error: "full" }, 507);
      let sid = pick(3);
      while (all.has("s:" + sid)) sid = pick(3);
      const s = { id: sid, title, rhythm: body.rhythm, max: size(body.max), ...times, token: crypto.randomUUID(), at: now, used: now, going: null };
      await store.put("s:" + sid, s);
      const { token, at, used, going: _, ...pub } = s;
      return json({ ...pub, token }, 201);
    }
    const s = id && (await store.get("s:" + id));
    if (!s) return json({ error: "not found" }, 404);
    if (!going && request.method === "DELETE") {
      if (typeof body.token !== "string" || body.token !== s.token) return json({ error: "forbidden" }, 403);
      await store.delete("s:" + id);
      await this.unsubscribe([id], now);
      return new Response(null, { status: 204 });
    }
    if (!going && request.method === "GET") return json({ title: s.title, rhythm: s.rhythm });
    if (going === "push" && (request.method === "POST" || request.method === "DELETE")) return this.subscribe(request.method, s, body, ip, now);
    if (going === "going" && request.method === "POST") {
      const cid = clean(body.cid, 40), o = nextSession(s, now);
      if (!cid || !o) return json({ error: "bad request" }, 400);
      if (!(await this.spend("ip:g:" + ip, GOING_BURST, GOING_EVERY_MS, now))) return json({ error: "slow down" }, 429);
      const ids = (s.going && s.going.at === o.start ? s.going.ids : []).filter((x) => x !== cid);
      if (body.on === true && ids.length < GOING_MAX) ids.push(cid);
      await store.put("s:" + id, { ...s, going: { at: o.start, ids } });
      return json({ going: ids.length, start: o.start });
    }
    return json({ error: "not found" }, 404);
  }

  async subscribe(method, s, body, ip, now) {
    const store = this.ctx.storage, cid = clean(body.cid, 40), key = "p:" + s.id + ":" + cid, sub = method === "POST" && readSub(body.sub);
    if (!cid) return json({ error: "bad request" }, 400);
    if (method === "POST" && !pushReady(this.env)) return json({ error: "push off" }, 503);
    if (method === "POST" && !sub) return json({ error: "bad subscription" }, 400);
    if (!(await this.spend("ip:p:" + ip, PUSH_BURST, PUSH_EVERY_MS, now))) return json({ error: "slow down" }, 429);
    if (!sub) await store.delete(key);
    else {
      if (!(await store.get(key))) {
        const all = [...(await store.list({ prefix: "p:" })).keys()];
        if (all.length >= PUSH_TOTAL || all.filter((k) => k.startsWith("p:" + s.id + ":")).length >= PUSH_PER_SCHED) return json({ error: "full" }, 507);
      }
      await store.put(key, sub);
    }
    await this.arm(now);
    return new Response(null, { status: 204 });
  }

  async unsubscribe(ids, now) {
    const store = this.ctx.storage, keys = [];
    for (const id of ids) keys.push(...(await store.list({ prefix: "p:" + id + ":" })).keys());
    for (let i = 0; i < keys.length; i += 128) await store.delete(keys.slice(i, i + 128));
    await this.arm(now);
  }

  // Wakes the lobby at the next session start that has push subscribers.
  async arm(now) {
    const store = this.ctx.storage, ids = new Set([...(await store.list({ prefix: "p:" })).keys()].map((k) => k.slice(2, 5)));
    let next = Infinity;
    for (const id of pushReady(this.env) ? ids : []) {
      const s = await store.get("s:" + id), t = s && pushAt(s, now);
      if (t && t < next) next = t;
    }
    if (next < Infinity) await store.setAlarm(next);
    else if ((await store.getAlarm()) != null) await store.deleteAlarm();
  }

  // One schedule per run keeps each run within the subrequest limit; the next due one re-arms for now.
  async alarm() {
    const store = this.ctx.storage, now = Date.now(), by = new Map();
    for (const [k, sub] of await store.list({ prefix: "p:" })) {
      const id = k.slice(2, 5);
      by.set(id, [...(by.get(id) || []), [k, sub]]);
    }
    for (const [id, subs] of pushReady(this.env) ? by : []) {
      const s = await store.get("s:" + id);
      if (!s) { await this.unsubscribe([id], now); continue; }
      if (pushAt(s, now) !== now) continue;
      const o = nextSession(s, now), text = pushBody(s.title, o.start, sessionCode(id, o.start));
      const ttl = Math.max(60, Math.min(PUSH_TTL_S, Math.round((o.end - now) / 1000)));
      await store.put("s:" + id, { ...s, pushed: o.start });
      const dead = [];
      await Promise.all(subs.map(async ([k, sub]) => {
        try {
          const status = await sendPush(sub, text, this.env, { ttl, now });
          if (status === 404 || status === 410) dead.push(k);
        } catch {}
      }));
      if (dead.length) await store.delete(dead);
      break;
    }
    await this.arm(now);
  }
}

// A standing group of up to eight: who's in it, who's around and focusing, the rounds they finish each week, and an optional crew time with reminders.
export class Crew extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const store = this.ctx.storage, path = new URL(request.url).pathname, now = Date.now(), c = await store.get("crew");
    if (path === "/open") {
      if (c) return new Response(null, { status: 409 });
      const { name, tz, room } = await request.json();
      await store.put("crew", { name, tz, room, made: now, used: now, slot: null, pushed: 0, members: [] });
      await store.setAlarm(now + CREW_FRESH_MS);
      return new Response(null, { status: 204 });
    }
    if (path === "/info") return c ? json({ name: c.name, size: c.members.length, max: CREW_MAX, slot: c.slot }) : json({ error: "not found" }, 404);
    if (path === "/push") return c ? this.push(request, c, now) : json({ error: "not found" }, 404);
    const [client, server] = Object.values(new WebSocketPair());
    if (c) this.ctx.acceptWebSocket(server);
    else {
      server.accept();
      server.close(4004, "No such crew");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except).map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((x) => x.a && x.a.cid);
  }

  send(ws, body) {
    try { ws.send(JSON.stringify(body)); } catch {}
  }

  // Each member may be here from several tabs or devices; the most recent timer state speaks for them.
  async broadcast(except) {
    const store = this.ctx.storage, c = await store.get("crew"), socks = this.sockets(except), now = Date.now();
    if (!c) return;
    const live = new Map();
    for (const { a } of socks) { const cur = live.get(a.cid); if (!cur || (a.at || 0) > (cur.at || 0)) live.set(a.cid, a); }
    const weeks = (await store.get("weeks")) || {}, start = weekStart(now, c.tz), last = weekStart(start - 1, c.tz);
    const sum = (w) => Object.values(weeks[w] || {}).reduce((n, x) => n + x, 0);
    const members = c.members.map((m) => ({ id: m.pid, name: m.name, on: live.has(m.cid), s: (live.get(m.cid) || {}).s || null }));
    const info = { name: c.name, room: c.room, tz: c.tz, slot: c.slot };
    for (const { ws, a } of socks) this.send(ws, { t: "crew", now, you: a.pid, crew: info, members, week: { n: sum(start), last: sum(last), mine: (weeks[start] || {})[a.pid] || 0 } });
  }

  async count(pid, now, tz) {
    const store = this.ctx.storage, weeks = (await store.get("weeks")) || {}, start = weekStart(now, tz);
    weeks[start] = { ...weeks[start], [pid]: ((weeks[start] || {})[pid] || 0) + 1 };
    const keep = Object.keys(weeks).map(Number).sort((a, b) => b - a).slice(0, 2);
    await store.put("weeks", Object.fromEntries(keep.map((k) => [k, weeks[k]])));
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 600) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    const store = this.ctx.storage, now = Date.now(), me = ws.deserializeAttachment(), c = await store.get("crew");
    if (!c) return ws.close(4004, "No such crew");

    if (m.t === "hello") {
      if (me) return;
      const cid = clean(m.cid, 40), name = clean(m.name, 20);
      if (!cid || !name) return ws.close(4000, "Bad hello");
      let mem = c.members.find((x) => x.cid === cid);
      if (!mem) {
        if (c.members.length >= CREW_MAX) return ws.close(4003, "Crew is full");
        mem = { cid, pid: pick(8), name, at: now, lr: 0 };
        c.members.push(mem);
      }
      mem.name = name;
      c.used = now;
      await store.put("crew", c);
      ws.serializeAttachment({ cid, pid: mem.pid, s: null, at: now });
      await this.arm(now);
      return this.broadcast();
    }
    const mem = me && c.members.find((x) => x.cid === me.cid);
    if (!mem) return;

    if (m.t === "state") {
      const s = m.s || {};
      if (!MODES.includes(s.mode) || !STATUSES.includes(s.status)) return;
      const rem = ms(s.remaining), was = me.s;
      me.s = { mode: s.mode, status: s.status, total: ms(s.total), rem, end: s.status === "running" ? now + rem : 0 };
      me.at = now;
      ws.serializeAttachment(me);
      if (roundDone(was, me.s, now) && now - (mem.lr || 0) >= ROUND_GAP_MS) {
        mem.lr = now;
        await store.put("crew", c);
        await this.count(mem.pid, now, c.tz);
      }
      return this.broadcast();
    }

    if (m.t === "name" || m.t === "slot") {
      const n = tokens(me.cb, now, SIG_BURST, SIG_EVERY_MS);
      if (n < 1) return;
      me.cb = { n: n - 1, at: now };
      ws.serializeAttachment(me);
      if (m.t === "name") {
        const name = clean(m.name, CREW_NAME);
        if (!name) return;
        c.name = name;
      } else {
        const slot = m.slot === null ? null : readTimes(m.slot || {});
        if (m.slot !== null && !slot) return;
        c.slot = slot; c.pushed = 0;
      }
      await store.put("crew", c);
      await this.arm(now);
      return this.broadcast();
    }

    if (m.t === "leave") {
      c.members = c.members.filter((x) => x.cid !== me.cid);
      await store.delete("p:" + me.cid);
      for (const x of this.sockets()) if (x.a.cid === me.cid) { x.ws.serializeAttachment(null); x.ws.close(4007, "Left the crew"); }
      if (!c.members.length) return store.deleteAll();
      await store.put("crew", c);
      await this.arm(now);
      return this.broadcast();
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000); } catch {}
    if (ws.deserializeAttachment()) await this.broadcast(ws);
  }

  async webSocketError(ws) {
    await this.broadcast(ws);
  }

  // Only members can ask for the crew time's reminder.
  async push(request, c, now) {
    const store = this.ctx.storage, body = (await request.json().catch(() => null)) || {}, cid = clean(body.cid, 40);
    if (!cid || !c.members.some((x) => x.cid === cid)) return json({ error: "forbidden" }, 403);
    if (request.method === "DELETE") await store.delete("p:" + cid);
    else {
      const sub = readSub(body.sub);
      if (!pushReady(this.env)) return json({ error: "push off" }, 503);
      if (!sub) return json({ error: "bad subscription" }, 400);
      await store.put("p:" + cid, sub);
    }
    await this.arm(now);
    return new Response(null, { status: 204 });
  }

  // Wakes for the next crew-time reminder, or to forget a crew nobody has opened in a long while.
  async arm(now) {
    const store = this.ctx.storage, c = await store.get("crew");
    if (!c) return;
    let next = (c.members.length ? c.used + CREW_IDLE_MS : c.made + CREW_FRESH_MS);
    if (c.slot && pushReady(this.env) && (await store.list({ prefix: "p:", limit: 1 })).size) {
      const t = pushAt({ ...c.slot, pushed: c.pushed }, now);
      if (t && t < next) next = t;
    }
    await store.setAlarm(Math.max(now, next));
  }

  async alarm() {
    const store = this.ctx.storage, now = Date.now(), c = await store.get("crew");
    if (!c) return;
    if (!this.sockets().length && (c.members.length ? now - c.used >= CREW_IDLE_MS : now - c.made >= CREW_FRESH_MS)) return store.deleteAll();
    if (c.slot && pushReady(this.env) && pushAt({ ...c.slot, pushed: c.pushed }, now) === now) {
      const o = nextSession(c.slot, now), text = pushBody(c.name, o.start, c.room), dead = [];
      c.pushed = o.start;
      await store.put("crew", c);
      const ttl = Math.max(60, Math.min(PUSH_TTL_S, Math.round((o.end - now) / 1000)));
      await Promise.all([...(await store.list({ prefix: "p:" }))].map(async ([k, sub]) => {
        try {
          const status = await sendPush(sub, text, this.env, { ttl, now });
          if (status === 404 || status === 410) dead.push(k);
        } catch {}
      }));
      if (dead.length) await store.delete(dead);
    }
    await this.arm(now);
  }
}
