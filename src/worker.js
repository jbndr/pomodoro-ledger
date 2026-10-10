import { DurableObject } from "cloudflare:workers";
import { hit, stats } from "./hits.js";
import { pushBody, pushReady, readSub, sendPush } from "./push.js";
import { handleSync } from "./sync.js";
import { nextSession, readTimes, scheduleOf, sessionCode, startStep } from "../web/src/lib/schedule.ts";

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
const HOUSE = [{ key: "P", rhythm: "25/5", title: "Pomodoro" }, { key: "D", rhythm: "50/10", title: "Deep work" }];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const pick = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHABET[x % ALPHABET.length]).join("");
const room = (env, code) => env.ROOM.get(env.ROOM.idFromName(code));
const ms = (v) => Math.max(0, Math.min(MAX_RUN_MS, Math.round(Number(v) || 0)));
const clean = (v, n) => String(v || "").replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
// A token bucket per member: a short burst, then one reaction every few seconds.
const tokens = (b, now, burst = REACT_BURST, every = REACT_EVERY_MS) => (b ? Math.min(burst, b.n + (now - b.at) / every) : burst);
const size = (v) => { const n = Math.round(Number(v ?? MAX_MEMBERS)); return Number.isFinite(n) ? Math.max(MIN_MEMBERS, Math.min(MAX_MEMBERS, n)) : MAX_MEMBERS; };
const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName("lobby"));
// When subscribers are next owed a push: the next start, or now if a session just began unannounced.
function pushAt(s, now) {
  const o = nextSession(s, now);
  if (!o) return null;
  if (o.start > now) return o.start;
  if (s.pushed !== o.start && now - o.start < PUSH_LATE_MS) return now;
  const n = nextSession(s, o.end);
  return n && n.start;
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
    if (url.pathname === "/api/rooms" && request.method === "GET") return lobby(env).fetch("https://lobby/rooms");
    if (url.pathname === "/api/push" && request.method === "GET") return json({ key: pushReady(env) ? env.VAPID_PUBLIC_KEY.trim() : null });
    if (url.pathname === "/api/room" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      let cfg = null;
      if (body && body.pub) {
        cfg = { pub: true, house: false, title: clean(body.title, 32), rhythm: body.rhythm, max: size(body.max) };
        if (!cfg.title || !RHYTHMS.includes(cfg.rhythm)) return json({ error: "bad room" }, 400);
      }
      for (let i = 0; i < 5; i++) {
        const code = pick(6);
        const ownerToken = crypto.randomUUID();
        const res = await room(env, code).fetch("https://room/open", { method: "POST", body: JSON.stringify({ ownerToken, cfg: cfg && { ...cfg, code } }) });
        if (res.ok) return json({ code, ownerToken });
      }
      return json({ error: "busy" }, 503);
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
    if (path === "/open") {
      if (await store.get("open")) return new Response(null, { status: 409 });
      const { ownerToken, cfg } = await request.json();
      await store.put("open", Date.now());
      await store.put("ownerToken", ownerToken);
      if (cfg) await store.put("cfg", cfg);
      await store.setAlarm(Date.now() + EMPTY_MS);
      return new Response(null, { status: 204 });
    }
    const code = path.split("/")[3] || "";
    if (!(await store.get("open"))) {
      const cfg = houseRoom(code) || (scheduleOf(code) && (await this.session(code)));
      if (cfg) {
        await store.put("open", Date.now());
        await store.put("cfg", cfg);
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
    const all = this.members(except), prop = (await this.ctx.storage.get("prop")) || null, now = Date.now();
    const cfg = await this.ctx.storage.get("cfg"), pub = cfg ? { title: cfg.title, rhythm: cfg.rhythm, house: cfg.house, max: cfg.max || MAX_MEMBERS } : null;
    const members = all.map(({ a }) => ({ id: a.pub, name: a.name, s: a.s, owner: !!a.owner }));
    for (const { ws, a } of all) this.send(ws, { t: "room", now, you: a.pub, owner: !!a.owner, members, prop, pub });
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
      let rb = null;
      for (const x of this.members(ws)) {
        if (x.a.id !== id) { others.push(x); continue; }
        rb = x.a.rb || null;
        x.ws.serializeAttachment(null);
        x.ws.close(4001, "Replaced");
      }
      const ownerToken = await store.get("ownerToken"), cfg = await store.get("cfg");
      if (others.length >= ((cfg && cfg.max) || MAX_MEMBERS)) return ws.close(4003, "Room is full");
      const owner = !cfg && !!ownerToken && m.ownerToken === ownerToken;
      ws.serializeAttachment({ id, pub: pick(8), name, s: null, asked: 0, owner, rb });
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

    // Public rooms follow the room clock: nobody owns them and there's nothing to vote on.
    if (m.t !== "state" && (await store.get("cfg"))) return;

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
      const rem = ms(s.remaining);
      me.s = { mode: s.mode, status: s.status, total: ms(s.total), rem, end: s.status === "running" ? now + rem : 0 };
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
    if (path === "/schedule" || path.startsWith("/schedule/")) return this.schedule(request, path, now);
    if (request.method === "POST") {
      const r = await request.json();
      if (r.names.length) await store.put("r:" + r.code, { ...r, at: now });
      else await store.delete("r:" + r.code);
      const id = scheduleOf(r.code), s = id && r.names.length && (await store.get("s:" + id));
      if (s) await store.put("s:" + id, { ...s, used: now });
      return new Response(null, { status: 204 });
    }
    const rooms = [], upcoming = [], stale = [], reported = await store.list({ prefix: "r:" });
    for (const [k, r] of reported) {
      if (now - r.at > LISTED_MS) stale.push(k);
      else if (!scheduleOf(r.code)) rooms.push({ code: r.code, title: r.title, rhythm: r.rhythm, house: r.house, max: r.max || MAX_MEMBERS, names: r.names });
    }
    const gone = [];
    for (const [k, s] of await store.list({ prefix: "s:" })) {
      const o = nextSession(s, now);
      if (now - s.used > SCHED_IDLE_MS || !o) { stale.push(k); gone.push(s.id); continue; }
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
