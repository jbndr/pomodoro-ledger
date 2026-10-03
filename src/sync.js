import { DurableObject } from "cloudflare:workers";

const KINDS = ["task", "profile"];
const MAX_BODY = 256 * 1024;
const MAX_DOCS = 20000;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const ledger = (env, email) => env.LEDGER.get(env.LEDGER.idFromName(email));

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

let certs = null;
async function accessKeys(team) {
  if (certs && certs.team === team && Date.now() - certs.at < 3600000) return certs.keys;
  const res = await fetch("https://" + team + "/cdn-cgi/access/certs");
  if (!res.ok) throw new Error("certs " + res.status);
  certs = { team, at: Date.now(), keys: (await res.json()).keys || [] };
  return certs.keys;
}

const accessConfigured = (env) => !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
// Local dev only (.dev.vars). Ignored whenever Access is configured, so it can never bypass login in production.
const devEmail = (env) => (!accessConfigured(env) && env.DEV_USER_EMAIL ? String(env.DEV_USER_EMAIL).toLowerCase() : "");

export function syncConfigured(env) {
  return accessConfigured(env) || !!devEmail(env);
}

// Access sits in front of /api/sync, but the Worker still verifies the token so a misconfigured route can't expose data.
export async function accessEmail(request, env) {
  if (devEmail(env)) return devEmail(env);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !accessConfigured(env)) return null;
  try {
    const [h, p, sig] = token.split(".");
    const header = b64json(h), claims = b64json(p);
    if (header.alg !== "RS256") return null;
    const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(h + "." + p));
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const now = Date.now() / 1000;
    if (!ok || !aud.includes(env.ACCESS_AUD) || claims.iss !== "https://" + env.ACCESS_TEAM_DOMAIN) return null;
    if (!(claims.exp > now) || (claims.nbf && claims.nbf > now + 60) || typeof claims.email !== "string") return null;
    return claims.email.toLowerCase();
  } catch {
    return null;
  }
}

export async function handleSync(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  if (!syncConfigured(env)) return path === "/api/sync/me" ? json({ configured: false }) : json({ error: "sync is not configured" }, 404);
  const email = await accessEmail(request, env);
  if (path === "/api/sync/me") return json({ configured: true, signedIn: !!email, email: email || "" });
  if (!email) return json({ error: "signed out" }, 401);
  if (path === "/api/sync/login") return new Response(null, { status: 302, headers: { location: "/?synced=1", "cache-control": "no-store" } });
  if (path === "/api/sync/export" && request.method === "GET") {
    const res = await ledger(env, email).fetch("https://ledger/export", { headers: { "x-email": email } });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store", "content-disposition": 'attachment; filename="pomodoro-ledger-' + day + '.json"' } });
  }
  if (path === "/api/sync/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
    const origin = request.headers.get("Origin");
    if (origin && new URL(origin).host !== url.host) return json({ error: "forbidden" }, 403);
    return ledger(env, email).fetch(request);
  }
  return json({ error: "not found" }, 404);
}

// One per user, keyed by email. Plain SQLite with last-write-wins per document, so the data moves anywhere as-is.
export class Ledger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT, at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, id))");
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (new URL(request.url).pathname === "/export") {
      const docs = this.sql.exec("SELECT kind, id, body, at FROM docs WHERE deleted = 0 ORDER BY kind, id").toArray()
        .map((r) => ({ kind: r.kind, id: r.id, at: r.at, body: JSON.parse(r.body) }));
      return json({ format: "pomodoro-ledger/1", email: request.headers.get("x-email") || "", exportedAt: Date.now(), docs });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  row(kind, id) {
    return this.sql.exec("SELECT kind, id, body, at, deleted FROM docs WHERE kind = ? AND id = ?", kind, id).toArray()[0] || null;
  }

  wire(r) {
    return r.deleted ? { t: "del", kind: r.kind, id: r.id, at: r.at } : { t: "put", kind: r.kind, id: r.id, at: r.at, body: JSON.parse(r.body) };
  }

  send(ws, body) {
    try { ws.send(JSON.stringify(body)); } catch {}
  }

  others(ws, body) {
    for (const s of this.ctx.getWebSockets()) if (s !== ws) this.send(s, body);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_BODY + 1024) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;

    if (m.t === "hello") {
      const docs = this.sql.exec("SELECT kind, id, body, at, deleted FROM docs").toArray().map((r) => this.wire(r));
      return this.send(ws, { t: "snapshot", docs });
    }
    if (m.t !== "put" && m.t !== "del") return;
    const id = typeof m.id === "string" ? m.id : "", at = Math.round(Number(m.at));
    if (!KINDS.includes(m.kind) || !id || id.length > 80 || !Number.isFinite(at) || at <= 0) return;
    if (m.kind === "profile" && id !== "profile") return;
    const cur = this.row(m.kind, id);
    // An older write lost; tell the sender what won so it can converge.
    if (cur && cur.at > at) return this.send(ws, this.wire(cur));

    if (m.t === "put") {
      if (!m.body || typeof m.body !== "object") return;
      const body = JSON.stringify(m.body);
      if (body.length > MAX_BODY) return this.send(ws, { t: "error", code: "too_large", id });
      if (!cur && this.sql.exec("SELECT COUNT(*) AS n FROM docs").one().n >= MAX_DOCS) return this.send(ws, { t: "error", code: "quota_exceeded", id });
      this.sql.exec("INSERT INTO docs (kind, id, body, at, deleted) VALUES (?, ?, ?, ?, 0) ON CONFLICT (kind, id) DO UPDATE SET body = excluded.body, at = excluded.at, deleted = 0", m.kind, id, body, at);
      return this.others(ws, { t: "put", kind: m.kind, id, at, body: m.body });
    }
    if (!cur || cur.deleted) {
      this.sql.exec("INSERT INTO docs (kind, id, body, at, deleted) VALUES (?, ?, NULL, ?, 1) ON CONFLICT (kind, id) DO UPDATE SET body = NULL, at = excluded.at, deleted = 1", m.kind, id, at);
      return;
    }
    this.sql.exec("UPDATE docs SET body = NULL, at = ?, deleted = 1 WHERE kind = ? AND id = ?", at, m.kind, id);
    this.others(ws, { t: "del", kind: m.kind, id, at });
  }

  async webSocketClose(ws) {
    try { ws.close(1000); } catch {}
  }
}
