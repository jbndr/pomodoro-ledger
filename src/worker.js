import { DurableObject } from "cloudflare:workers";
import { handleSync } from "./sync.js";

export { Ledger } from "./sync.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MODES = ["focus", "short", "long"];
const STATUSES = ["idle", "running", "paused"];
const MAX_MEMBERS = 12;
const MAX_RUN_MS = 4 * 3600000;
const PROPOSAL_MS = 30000;
const COOLDOWN_MS = 60000;
const EMPTY_MS = 10 * 60000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const pick = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHABET[x % ALPHABET.length]).join("");
const room = (env, code) => env.ROOM.get(env.ROOM.idFromName(code));
const ms = (v) => Math.max(0, Math.min(MAX_RUN_MS, Math.round(Number(v) || 0)));
const cleanName = (v) => String(v || "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 20);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/room" && request.method === "POST") {
      for (let i = 0; i < 5; i++) {
        const code = pick(6);
        const ownerToken = crypto.randomUUID();
        const res = await room(env, code).fetch("https://room/open", { method: "POST", body: ownerToken });
        if (res.ok) return json({ code, ownerToken });
      }
      return json({ error: "busy" }, 503);
    }
    const m = url.pathname.match(/^\/api\/room\/([A-Z2-9]{6})\/ws$/);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
      const origin = request.headers.get("Origin");
      if (origin && new URL(origin).host !== url.host) return json({ error: "forbidden" }, 403);
      return room(env, m[1]).fetch(request);
    }
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
    const store = this.ctx.storage;
    if (new URL(request.url).pathname === "/open") {
      if (await store.get("open")) return new Response(null, { status: 409 });
      await store.put("open", Date.now());
      await store.put("ownerToken", await request.text());
      await store.setAlarm(Date.now() + EMPTY_MS);
      return new Response(null, { status: 204 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    if (await store.get("open")) this.ctx.acceptWebSocket(server);
    else {
      server.accept();
      server.close(4004, "No such room");
    }
    return new Response(null, { status: 101, webSocket: client });
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
    const members = all.map(({ a }) => ({ id: a.pub, name: a.name, s: a.s, owner: !!a.owner }));
    for (const { ws, a } of all) this.send(ws, { t: "room", now, you: a.pub, owner: !!a.owner, members, prop });
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
      const id = String(m.id || "").slice(0, 40), name = cleanName(m.name);
      if (!id || !name) return ws.close(4000, "Bad hello");
      const others = [];
      for (const x of this.members(ws)) {
        if (x.a.id !== id) { others.push(x); continue; }
        x.ws.serializeAttachment(null);
        x.ws.close(4001, "Replaced");
      }
      if (others.length >= MAX_MEMBERS) return ws.close(4003, "Room is full");
      const ownerToken = await store.get("ownerToken");
      const owner = !!ownerToken && m.ownerToken === ownerToken;
      ws.serializeAttachment({ id, pub: pick(8), name, s: null, asked: 0, owner });
      return this.broadcast();
    }
    if (!me) return;

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
    const store = this.ctx.storage;
    if (!this.members().length) return store.deleteAll();
    const prop = await store.get("prop");
    if (!prop || Date.now() < prop.ends) return;
    await store.delete("prop");
    this.note("Not everyone answered in time, so timers stay as they are.");
    await this.broadcast();
  }
}
