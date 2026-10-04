import { toast } from "./chrome/notice.svelte";
import type { SyncState } from "./lib/settings";
import { renderPill } from "./render";
import { clone, DEF, ls, S, T, type Task } from "./state";
import type { Collection, Profile, ProfileDoc, SyncError } from "./store";
import { applyTimer, type TimerDoc } from "./timer/engine";
import { renderSyncTab } from "./ui";

type Doc = { t: "put" | "del"; kind: "task" | "profile" | "timer"; id: string; at: number; body?: any };
type Msg = Doc | { t: "snapshot"; docs?: Doc[] } | { t: "error"; code?: string };

/**
 * Account sync: Cloudflare Access login + one Durable Object per user.
 * Gives Store the same doc/collection surface it uses elsewhere, over a WebSocket. Conflicts resolve last-write-wins.
 */
export const Cloud = {
  state: "off" as SyncState, email: "", configured: false, ws: null as WebSocket | null, docs: new Map<string, Task>(), retry: 0,
  subs: {} as { tasks?: Parameters<Collection["onSnapshot"]>[0]; err?: (e: SyncError) => void; prof?: Parameters<ProfileDoc["onSnapshot"]>[0] },
  timer: undefined as ReturnType<typeof setTimeout> | undefined, ping: undefined as ReturnType<typeof setInterval> | undefined,
  async me(): Promise<{ configured: boolean; signedIn?: boolean; email?: string } | null> {
    try {
      const r = await fetch("/api/sync/me", { redirect: "manual", cache: "no-store" });
      if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403) return { configured: true, signedIn: false };
      if (!r.ok) return { configured: false };
      return await r.json();
    } catch { return null; }
  },
  set(state: SyncState) { this.state = state; renderPill(); renderSyncTab(); },
  async start(): Promise<{ prof: ProfileDoc; col: Collection } | null> {
    const me = await this.me();
    if (me) { this.email = me.signedIn ? me.email || "" : ""; ls.set("pl.syncEmail", this.email); this.configured = !!me.configured; }
    else { this.email = ls.get("pl.syncEmail", ""); this.configured = !!this.email; }
    if (!this.email) { this.set(this.configured ? "signedout" : "off"); return null; }
    const col: Collection = {
      onSnapshot: (cb, err) => { this.subs.tasks = cb; this.subs.err = err; },
      doc: (id) => ({
        set: async (body) => { this.docs.set(id, body); this.push({ t: "put", kind: "task", id, at: body.updatedAt || Date.now(), body }); },
        delete: async () => { this.docs.delete(id); this.push({ t: "del", kind: "task", id, at: Date.now() }); },
      }),
    };
    const prof: ProfileDoc = {
      onSnapshot: (cb) => { this.subs.prof = cb; },
      set: async (body) => { this.push({ t: "put", kind: "profile", id: "profile", at: ls.get("pl.profileAt", 0) || Date.now(), body }); },
    };
    this.set("connecting"); this.open();
    addEventListener("online", () => this.wake());
    return { prof, col };
  },
  open() {
    clearTimeout(this.timer);
    let ws: WebSocket;
    try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/sync/ws"); } catch { return this.reconnect(); }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0; ws.send(JSON.stringify({ t: "hello" }));
      clearInterval(this.ping); this.ping = setInterval(() => { try { ws.send("ping"); } catch {} }, 25000);
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.receive(m); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; clearInterval(this.ping);
      if (this.state !== "signedout") { this.set("offline"); this.reconnect(); }
    };
  },
  reconnect() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const me = await this.me();
      if (me && me.configured && !me.signedIn) return this.signedOut();
      this.open();
    }, Math.min(30000, 1000 * 2 ** this.retry++));
  },
  wake() { if (this.state === "offline" && !this.ws) { this.retry = 0; this.reconnect(); } },
  signedOut() {
    this.email = ""; ls.set("pl.syncEmail", ""); this.set("signedout");
    if (this.subs.err) this.subs.err({ code: "revoked" });
    toast("You're signed out, so changes stay in this browser. Sign in again under Settings → Sync.");
  },
  push(m: Doc) {
    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(m)); return; } catch {} }
    if (m.t === "del") this.queueDelete(m.id, m.at);
  },
  queueDelete(id: string, at: number) { const d = ls.get<Record<string, number>>("pl.syncDel", {}); d[id] = at; ls.set("pl.syncDel", d); },
  pushTimer() {
    if (this.state !== "live") return;
    this.push({ t: "put", kind: "timer", id: "timer", at: ls.get("pl.timerAt", 0) || Date.now(), body: { T: clone(T), activeId: S.activeId } });
  },
  emitTasks() { if (this.subs.tasks) this.subs.tasks({ docs: [...this.docs].map(([id, body]) => ({ id, exists: true, data: () => body })) }); },
  emitProfile(body: Profile) { if (this.subs.prof) this.subs.prof({ exists: true, data: () => body }); },
  receive(m: Msg) {
    if (m.t === "snapshot") return this.merge(m.docs || []);
    if (m.t === "error") return toast(m.code === "quota_exceeded" ? "Your synced ledger is full. Delete a few old tasks to keep syncing." : "That task is too large to sync.");
    if (m.kind === "profile" && m.t === "put") { ls.set("pl.profileAt", m.at); return this.emitProfile(m.body); }
    if (m.kind === "timer" && m.t === "put") return applyTimer(m.body as TimerDoc, m.at);
    if (m.kind !== "task") return;
    if (m.t === "put") this.docs.set(m.id, m.body); else if (m.t === "del") this.docs.delete(m.id);
    this.emitTasks();
  },
  // Runs on every (re)connect: whatever changed here while offline is pushed if it's newer than the server's copy.
  merge(list: Doc[]) {
    const server = new Map<string, Doc>();
    let profile: Doc | null = null, timer: Doc | null = null;
    for (const d of list) { if (d.kind === "task") server.set(d.id, d); else if (d.kind === "profile") profile = d; else if (d.kind === "timer") timer = d; }
    this.docs = new Map();
    for (const [id, d] of server) if (d.t === "put") this.docs.set(id, d.body);
    for (const t of S.tasks.values()) {
      const d = server.get(t.id), mine = t.updatedAt || 0;
      if (t.sample || (d && d.at >= mine)) continue;
      this.docs.set(t.id, t); this.push({ t: "put", kind: "task", id: t.id, at: mine || Date.now(), body: t });
    }
    const pending = ls.get<Record<string, number>>("pl.syncDel", {});
    ls.set("pl.syncDel", {});
    for (const [id, at] of Object.entries(pending)) {
      const d = server.get(id);
      if (d && d.t === "put" && d.at <= at) { this.docs.delete(id); this.push({ t: "del", kind: "task", id, at }); }
    }
    // Without a recorded change time, customised settings still beat a fresh device's defaults.
    const localAt = ls.get("pl.profileAt", 0) || (JSON.stringify({ ...DEF, ...S.settings }) !== JSON.stringify(DEF) || S.labels.length ? 2 : 1);
    if (profile && profile.t === "put" && profile.at >= localAt) { ls.set("pl.profileAt", profile.at); this.emitProfile(profile.body); }
    else this.push({ t: "put", kind: "profile", id: "profile", at: localAt, body: { settings: clone(S.settings), labels: clone(S.labels) } });
    this.set("live");
    this.emitTasks();
    // After tasks, so the active task the timer points at already exists.
    const timerAt = ls.get("pl.timerAt", 0);
    if (timer && timer.t === "put" && timer.at > timerAt) applyTimer(timer.body, timer.at);
    else if (timerAt) this.pushTimer();
  },
};
