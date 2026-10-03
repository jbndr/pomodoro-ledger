import { addDays, dayKey, keyTime, nextMonday, pad, sod } from "./lib/dates";
import { parseWhen } from "./lib/when";
import { parseTitle } from "./lib/quickEntry";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const MIN = 60000;
const DEMO = new URLSearchParams(location.search).get("demo") === "1";
const DEF = { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoFocus: false, sound: true, notify: false, goal: 8, ticking: false, tickVolume: 20, tickPace: 2, autoFloat: false, workdayEnd: "", sections: [] };
const ls = {
  get(k, d) { if (DEMO) return d; try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { if (DEMO) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- dates & formatting ----------
const fmtDur = (ms) => { const m = Math.round(ms / MIN); if (m < 60) return m + "m"; const h = Math.floor(m / 60), r = m % 60; return r ? h + "h " + r + "m" : h + "h"; };
const fmtDate = (t, o = { day: "numeric", month: "short" }) => new Date(t).toLocaleDateString(undefined, o);
const fmtClock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

// ---------- state ----------
const S = {
  tasks: new Map(), settings: { ...DEF }, activeId: ls.get("pl.active", null),
  started: ls.get("pl.started", false), storeMode: "local", newEst: 2, newWhen: null, newKeep: [],
  confirmDel: null, showAll: false, logN: 8, confirmSes: null,
  subtaskDrafts: new Map(), openTask: null, taskView: "today", projectFilter: "", statsFilter: "", byRange: "30", labels: [], newLabel: "",
};
let T = Object.assign({ mode: "focus", status: "idle", remaining: null, endsAt: 0, total: 0, setIndex: 0, saved: {}, adj: {} }, ls.get("pl.timer", {}));
const dirty = new Set();

// ---------- storage: account db when available, this browser otherwise ----------
const Store = {
  col: null, prof: null, chains: {}, setTimer: null,
  loadLocal() {
    ls.get("pl.tasks", []).forEach((t) => t && t.id && S.tasks.set(t.id, t));
    S.settings = { ...DEF, ...ls.get("pl.settings", {}) };
    S.labels = Array.isArray(ls.get("pl.labels", [])) ? ls.get("pl.labels", []) : [];
    Labels.merge([]);
  },
  cache() { ls.set("pl.tasks", [...S.tasks.values()]); ls.set("pl.settings", S.settings); ls.set("pl.labels", S.labels); },
  async connect() {
    if (window.claude && typeof window.claude.use === "function") {
      let db, user, uid, prof, col;
      try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch { return; }
      if (!db || !user) return;
      try { uid = await user.id(); } catch {}
      if (!uid) return;
      try { prof = db.doc("data/users/" + uid + "/profile"); col = prof.collection("tasks"); } catch { return; }
      return this.attach(prof, col);
    }
    const cloud = await Cloud.start();
    if (cloud) this.attach(cloud.prof, cloud.col);
  },
  attach(prof, col) {
    this.prof = prof; this.col = col;
    let first = true;
    this.col.onSnapshot((snap) => {
      const next = new Map();
      snap.docs.forEach((d) => { if (d.exists) next.set(d.id, clone(d.data())); });
      if (first) {
        first = false;
        for (const id of dirty) {
          const mine = S.tasks.get(id), theirs = next.get(id);
          if (mine && (!theirs || (theirs.updatedAt || 0) < (mine.updatedAt || 0))) { next.set(id, mine); this.write(mine); }
        }
        dirty.clear();
        S.storeMode = "db";
      }
      S.tasks = next;
      if (S.tasks.size) markStarted(true);
      this.cache(); renderAll();
    }, (e) => { S.storeMode = "local"; renderPill(); if (e && e.code !== "revoked") toast("Sync paused. Your changes are kept in this browser for now."); });
    this.prof.onSnapshot((d) => {
      if (!d.exists) return;
      const b = d.data() || {};
      if (Array.isArray(b.labels)) { Labels.merge(b.labels); Store.cache(); refreshLabelPop(); }
      if (b.settings) { S.settings = { ...DEF, ...b.settings }; this.cache(); fillSettings(); autoFloatHandler(); renderTimer(true); renderStats(); }
    }, () => {});
  },
  write(t) {
    if (!this.col) return;
    const id = t.id, body = clone(t);
    this.chains[id] = (this.chains[id] || Promise.resolve())
      .then(() => this.col.doc(id).set(body))
      .catch((e) => this.fail(e));
  },
  fail(e) {
    const c = e && e.code;
    if (c === "quota_exceeded") toast("Storage is full. Delete a few old tasks to keep saving.");
    else if (c === "invalid_argument") { toast("You can view this ledger but not save to it."); }
    else toast("Couldn't save that change. Check your connection and try again.");
  },
  saveTask(t, render = true) {
    t.updatedAt = Date.now();
    S.tasks.set(t.id, t);
    this.cache();
    if (S.storeMode === "db") this.write(t); else dirty.add(t.id);
    if (render) renderAll();
  },
  saveTasks(list) {
    const now = Date.now();
    list.forEach((t) => { t.updatedAt = now; S.tasks.set(t.id, t); if (S.storeMode === "db") this.write(t); else dirty.add(t.id); });
    this.cache(); renderAll();
  },
  deleteTask(id) {
    S.tasks.delete(id); dirty.delete(id); this.cache();
    if (S.storeMode === "db" && this.col) {
      this.chains[id] = (this.chains[id] || Promise.resolve()).then(() => this.col.doc(id).delete()).catch((e) => this.fail(e));
    } else if (Cloud.email) Cloud.queueDelete(id, Date.now());
    renderAll();
  },
  saveSettings() {
    this.cache(); ls.set("pl.profileAt", Date.now());
    clearTimeout(this.setTimer);
    this.setTimer = setTimeout(() => {
      if (S.storeMode === "db" && this.prof) {
        this.chains._p = (this.chains._p || Promise.resolve()).then(() => this.prof.set({ settings: clone(S.settings), labels: clone(S.labels) })).catch((e) => this.fail(e));
      }
    }, 700);
  },
};

// ---------- account sync: Cloudflare Access login + one Durable Object per user ----------
// Gives Store the same doc/collection surface it uses elsewhere, over a WebSocket. Conflicts resolve last-write-wins.
const Cloud = {
  state: "off", email: "", ws: null, docs: new Map(), subs: {}, retry: 0, timer: 0, ping: 0,
  async me() {
    try {
      const r = await fetch("/api/sync/me", { redirect: "manual", cache: "no-store" });
      if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403) return { configured: true, signedIn: false };
      if (!r.ok) return { configured: false };
      return await r.json();
    } catch { return null; }
  },
  set(state) { this.state = state; renderPill(); renderSyncTab(); },
  async start() {
    const me = await this.me();
    if (me) { this.email = me.signedIn ? me.email : ""; ls.set("pl.syncEmail", this.email); this.configured = !!me.configured; }
    else { this.email = ls.get("pl.syncEmail", ""); this.configured = !!this.email; }
    if (!this.email) { this.set(this.configured ? "signedout" : "off"); return null; }
    const col = {
      onSnapshot: (cb, err) => { this.subs.tasks = cb; this.subs.err = err; },
      doc: (id) => ({
        set: async (body) => { this.docs.set(id, body); this.push({ t: "put", kind: "task", id, at: body.updatedAt || Date.now(), body }); },
        delete: async () => { this.docs.delete(id); this.push({ t: "del", kind: "task", id, at: Date.now() }); },
      }),
    };
    const prof = {
      onSnapshot: (cb) => { this.subs.prof = cb; },
      set: async (body) => { this.push({ t: "put", kind: "profile", id: "profile", at: ls.get("pl.profileAt", 0) || Date.now(), body }); },
    };
    this.set("connecting"); this.open();
    addEventListener("online", () => this.wake());
    return { prof, col };
  },
  open() {
    clearTimeout(this.timer);
    let ws;
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
  push(m) {
    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(m)); return; } catch {} }
    if (m.t === "del") this.queueDelete(m.id, m.at);
  },
  queueDelete(id, at) { const d = ls.get("pl.syncDel", {}); d[id] = at; ls.set("pl.syncDel", d); },
  pushTimer() {
    if (this.state !== "live") return;
    this.push({ t: "put", kind: "timer", id: "timer", at: ls.get("pl.timerAt", 0) || Date.now(), body: { T: clone(T), activeId: S.activeId } });
  },
  emitTasks() { if (this.subs.tasks) this.subs.tasks({ docs: [...this.docs].map(([id, body]) => ({ id, exists: true, data: () => body })) }); },
  emitProfile(body) { if (this.subs.prof) this.subs.prof({ exists: true, data: () => body }); },
  receive(m) {
    if (m.t === "snapshot") return this.merge(m.docs || []);
    if (m.t === "error") return toast(m.code === "quota_exceeded" ? "Your synced ledger is full. Delete a few old tasks to keep syncing." : "That task is too large to sync.");
    if (m.kind === "profile" && m.t === "put") { ls.set("pl.profileAt", m.at); return this.emitProfile(m.body); }
    if (m.kind === "timer" && m.t === "put") return applyTimer(m.body, m.at);
    if (m.kind !== "task") return;
    if (m.t === "put") this.docs.set(m.id, m.body); else if (m.t === "del") this.docs.delete(m.id);
    this.emitTasks();
  },
  // Runs on every (re)connect: whatever changed here while offline is pushed if it's newer than the server's copy.
  merge(list) {
    const server = new Map();
    let profile = null, timer = null;
    for (const d of list) { if (d.kind === "task") server.set(d.id, d); else if (d.kind === "profile") profile = d; else if (d.kind === "timer") timer = d; }
    this.docs = new Map();
    for (const [id, d] of server) if (d.t === "put") this.docs.set(id, d.body);
    for (const t of S.tasks.values()) {
      const d = server.get(t.id), mine = t.updatedAt || 0;
      if (t.sample || (d && d.at >= mine)) continue;
      this.docs.set(t.id, t); this.push({ t: "put", kind: "task", id: t.id, at: mine || Date.now(), body: t });
    }
    const pending = ls.get("pl.syncDel", {});
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

// ---------- example data (in memory only, never saved) ----------
function makeSamples() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Date.now(), today = sod(now);
  const at = (ago, hour) => Math.min(now - 5 * MIN, addDays(today, -ago) + hour * 3600000 + Math.floor(rnd() * 40) * MIN);
  const F = 25 * MIN;
  const mk = (id, title, est, created, done, plan) => {
    const sessions = [];
    plan.forEach(([ago, n, partial]) => {
      for (let i = 0; i < n; i++) sessions.push({ at: at(ago, 9 + i), ms: F, full: true });
      if (partial) sessions.push({ at: at(ago, 10 + n), ms: (8 + Math.floor(rnd() * 12)) * MIN, full: false });
    });
    return { id, title, est, done: done != null, createdAt: at(created, 8), doneAt: done != null ? at(done, 17) : null, sessions, sample: true };
  };
  const spread = (from, to, p, max) => { const out = []; for (let d = from; d >= to; d--) if (rnd() < p) out.push([d, 1 + Math.floor(rnd() * max), rnd() < 0.2]); return out; };
  const list = [
    mk("x1", "Migrate the blog to the new CMS", 10, 84, 58, spread(84, 58, 0.45, 2)),
    mk("x2", "Refactor auth middleware", 6, 21, 15, [[20, 2], [19, 1, true], [17, 1], [15, 1]]),
    mk("x3", "Draft Q4 roadmap outline", 4, 12, 6, [[11, 1], [9, 2, true], [7, 1], [6, 1]]),
    mk("x4", "Clear the pull-request review backlog", 2, 4, 2, [[3, 1], [2, 1]]),
    mk("x5", "Study for the cloud architect certification", 50, 110, null, spread(110, 1, 0.33, 2)),
    mk("x6", "Write the onboarding guide", 5, 3, null, [[1, 2], [0, 1]]),
    mk("x7", "Prepare the monthly investor update", 3, 0, null, []),
  ];
  list[5].today = list[6].today = true;
  return new Map(list.map((t) => [t.id, t]));
}
let SAMPLES = null;
const preview = () => DEMO || (!S.started && S.tasks.size === 0);
const viewTasks = () => (preview() ? (SAMPLES || (SAMPLES = makeSamples())) : S.tasks);
function markStarted(silent) {
  if (S.started) return;
  S.started = true; ls.set("pl.started", true);
  if (S.activeId && S.activeId.startsWith("x")) S.activeId = null;
  if (!silent) renderAll();
}

// ---------- derived numbers ----------
const cyclesOf = (t) => (t.sessions || []).filter((s) => s.full).length;
const ord = (t) => (t.order == null ? t.createdAt : t.order);
const todayKey = () => dayKey(Date.now());
// Planned days that have arrived (or passed) count as today, so nothing has to flip at midnight.
const bucketOf = (t, tk = todayKey()) => (t.today || (t.plan && t.plan <= tk) ? "today" : t.plan ? "upcoming" : "later");
const isToday = (t) => bucketOf(t) === "today";
// Optional headings inside Today ("Morning", "Admin"…). They persist across days and sync with settings.
const sections = () => (Array.isArray(S.settings.sections) ? S.settings.sections : []);
const secRank = (t) => { const i = sections().findIndex((x) => x.id === t.section); return i < 0 ? 0 : i + 1; };
const RANK = { today: 0, upcoming: 1, later: 2 };
const openOf = (vt) => {
  const tk = todayKey();
  return [...vt.values()].filter((t) => !t.done && !t.system).sort((a, b) => {
    const ba = bucketOf(a, tk), bb = bucketOf(b, tk);
    return RANK[ba] - RANK[bb] || (ba === "upcoming" ? a.plan.localeCompare(b.plan) : ba === "today" ? secRank(a) - secRank(b) : 0) || ord(a) - ord(b);
  });
};
function dayName(k) {
  const days = Math.round((keyTime(k) - sod(Date.now())) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return (days === 7 ? "Next " : "") + fmtDate(keyTime(k), { weekday: "long" });
  return fmtDate(keyTime(k), { weekday: "short", day: "numeric", month: "short" });
}
const shortDay = (k) => fmtDate(keyTime(k), { weekday: "short" }) + " " + new Date(keyTime(k)).getDate();
// g is a list group: "today", "sec:<id>" (a section in Today), "later", or a YYYY-MM-DD day.
function placed(t, g, order) {
  const sec = g.startsWith("sec:") ? g.slice(4) : "";
  const n = { ...clone(t), order, today: g === "today" || !!sec };
  if (n.today || g === "later") delete n.plan; else n.plan = g;
  if (sec) n.section = sec; else delete n.section;
  return n;
}
const inGroup = (t, g) => (g === "today" ? isToday(t) : g.startsWith("sec:") ? isToday(t) && t.section === g.slice(4) : g === "later" ? bucketOf(t) === "later" : bucketOf(t) === "upcoming" && t.plan === g);
const groupName = (g) => (g === "today" ? "Today" : g === "later" ? "Later" : g.startsWith("sec:") ? (sections().find((x) => x.id === g.slice(4)) || {}).title || "section" : dayName(g));
const viewOf = (g) => (g === "later" ? g : g === "today" || g.startsWith("sec:") ? "today" : "upcoming");
function leaveRows(ids, done) {
  const rows = [...$("#taskList").querySelectorAll(".task")].filter((li) => ids.includes(li.dataset.id));
  if (!rows.length || calm()) return done();
  rows.forEach((li) => {
    li.style.overflow = "hidden";
    li.animate([{ height: li.offsetHeight + "px", opacity: 1, transform: "none" }, { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", transform: "translateX(18px)" }], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "forwards" });
  });
  // A timer rather than the animation's promise: animations pause in background tabs.
  setTimeout(done, 250);
}
function scheduleTask(id, g) {
  const t = S.tasks.get(id);
  if (!t) return;
  if (g !== "today" && g !== "later" && g <= todayKey()) g = "today";
  const where = g === "later" ? "Later" : dayName(g === "today" ? todayKey() : g);
  if (inGroup(t, g)) { toast("“" + t.title + "” is already in " + where + "."); return; }
  const last = Math.max(-1, ...openOf(S.tasks).filter((x) => x.id !== id && inGroup(x, g)).map(ord));
  const save = () => { Store.saveTask(placed(t, g, last + 1)); toast("Moved “" + t.title + "” to " + where + "."); };
  if (viewOf(g) !== S.taskView) leaveRows([id], save); else save();
}
const unplanned = (at) => {
  const id = "unplanned-" + dayKey(at).slice(0, 7);
  return S.tasks.get(id) || { id, title: "Unplanned focus", system: true, est: 0, done: false, createdAt: at, sessions: [] };
};
const timeOf = (t) => (t.sessions || []).reduce((a, s) => a + (s.ms || 0), 0);
function dayTotals(tasks) {
  const m = new Map();
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const k = dayKey(s.at); const o = m.get(k) || { ms: 0, cycles: 0 };
    o.ms += s.ms || 0; if (s.full) o.cycles++; m.set(k, o);
  }
  return m;
}

// ---------- timer ----------
const dur = (m) => (S.settings[m] || DEF[m]) * MIN;
const base = (m) => Math.max(MIN, dur(m) + (T.adj[m] || 0));
const totalNow = () => (T.status === "idle" ? base(T.mode) : T.total || dur(T.mode));
const remNow = () => T.status === "running" ? Math.max(0, T.endsAt - Date.now()) : T.status === "paused" ? T.remaining : base(T.mode);
// Worker timers aren't throttled in background tabs, so a phase ends (and notifies) on time.
let W = null;
try {
  W = new Worker(URL.createObjectURL(new Blob(["let t;onmessage=(e)=>{clearTimeout(t);if(e.data>=0)t=setTimeout(()=>postMessage(0),e.data+30)}"], { type: "text/javascript" })));
  W.onmessage = () => tick();
} catch {}
const arm = () => { if (W) W.postMessage(T.status === "running" ? Math.max(0, T.endsAt - Date.now()) : -1); };
// Quiet saves (late catch-up completions, states received from another device) aren't new changes, so they don't sync out.
let timerQuiet = false;
const saveTimer = () => {
  ls.set("pl.timer", T); ls.set("pl.active", S.activeId); arm(); syncTicking();
  if (!timerQuiet) { ls.set("pl.timerAt", Date.now()); Cloud.pushTimer(); }
};
function applyTimer(body, at) {
  if (!body || !body.T) return;
  timerQuiet = true;
  try {
    T = Object.assign({ mode: "focus", status: "idle", remaining: null, endsAt: 0, total: 0, setIndex: 0, saved: {}, adj: {} }, body.T);
    if (!["focus", "short", "long"].includes(T.mode)) T.mode = "focus";
    S.activeId = body.activeId && S.tasks.has(body.activeId) ? body.activeId : null;
    ls.set("pl.timerAt", at);
    cancelEnd(); saveTimer();
    if (T.status === "running") { scheduleEnd(); wakeOn(); } else wakeOff();
  } finally { timerQuiet = false; }
  renderAll();
}

// Sound: the end-of-phase bell is scheduled on the audio clock when a phase starts,
// so it rings on time even when the browser throttles timers in a background tab.
let AC = null, pending = [], pendingAt = 0;
function ensureAudio() {
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume().catch(() => {}); } catch {}
  syncTicking();
}
["pointerdown", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, ensureAudio, { passive: true, capture: true }));
const SOUNDS = {
  focus: { notes: [784, 988, 1175, 1568], gap: 0.17, vol: 0.32, len: 1.9 },
  break: { notes: [1175, 880, 784], gap: 0.22, vol: 0.3, len: 1.7 },
  task: { notes: [1047, 1568], gap: 0.11, vol: 0.24, len: 1.1 },
};
function playSound(kind, delay = 0) {
  if (!S.settings.sound) return [];
  ensureAudio();
  if (!AC) return [];
  const spec = SOUNDS[kind], nodes = [];
  try {
    const master = AC.createGain(); master.gain.value = spec.vol; master.connect(AC.destination);
    spec.notes.forEach((f, i) => {
      const t0 = AC.currentTime + Math.max(0, delay) + i * spec.gap;
      [[1, 1], [2.01, 0.32], [3.02, 0.12]].forEach(([mult, amp]) => {
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = "sine"; o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.len / mult);
        o.connect(g).connect(master); o.start(t0); o.stop(t0 + spec.len + 0.05);
        nodes.push(o);
      });
    });
  } catch {}
  return nodes;
}
function cancelEnd() {
  pending.forEach((n) => { try { n.stop(0); } catch {} try { n.disconnect(); } catch {} });
  pending = []; pendingAt = 0;
}
function scheduleEnd() {
  cancelEnd();
  if (T.status !== "running" || !S.settings.sound) return;
  const d = (T.endsAt - Date.now()) / 1000;
  if (d < 0.05) return;
  pending = playSound(T.mode === "focus" ? "focus" : "break", d);
  if (pending.length) pendingAt = T.endsAt;
}
// A looping audio buffer keeps a soft rhythm without background-tab timer bursts.
let ticking = null, tickingKey = "", tickPreview = null;
function stopTickingNode(node) {
  if (!node || !AC) return;
  try {
    const now = AC.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(0, now, .008);
    node.source.stop(now + .04);
  } catch {}
}
function cancelTickPreview() { stopTickingNode(tickPreview); tickPreview = null; }
function tickingNode(seconds) {
  if (!AC) return null;
  const pace = [1, 2, 4].includes(+S.settings.tickPace) ? +S.settings.tickPace : 2;
  const volume = Math.max(0, Math.min(100, +S.settings.tickVolume || 0)) / 100;
  if (!volume || seconds <= 0) return null;
  const buffer = AC.createBuffer(1, Math.ceil(AC.sampleRate * pace), AC.sampleRate);
  const samples = buffer.getChannelData(0);
  // Rounded attack and low sine harmonics avoid the sharp click of a clock.
  for (let i = 0; i < Math.min(samples.length, AC.sampleRate * .18); i++) {
    const t = i / AC.sampleRate, envelope = Math.min(1, t / .008) * Math.exp(-t * 38);
    samples[i] = .16 * envelope * (Math.sin(2 * Math.PI * 480 * t) + .18 * Math.sin(2 * Math.PI * 960 * t));
  }
  const source = AC.createBufferSource(), gain = AC.createGain();
  source.buffer = buffer; source.loop = true;
  gain.gain.value = volume;
  source.connect(gain).connect(AC.destination);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start(AC.currentTime + .03);
  source.stop(AC.currentTime + seconds);
  return { source, gain };
}
function syncTicking() {
  const on = AC && S.settings.ticking && T.mode === "focus" && T.status === "running" && T.endsAt > Date.now();
  const key = on ? [T.endsAt, S.settings.tickVolume, S.settings.tickPace].join(":") : "";
  if (key === tickingKey) return;
  stopTickingNode(ticking); ticking = null; tickingKey = "";
  if (on) {
    cancelTickPreview();
    try { ticking = tickingNode((T.endsAt - Date.now()) / 1000); if (ticking) tickingKey = key; } catch {}
  }
}
let wake = null;
async function wakeOn() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch {} }
function wakeOff() { try { wake && wake.release(); } catch {} wake = null; }

function logFocus(ms, full, at, run) {
  if (preview()) markStarted(true);
  const t = clone((S.activeId && S.tasks.get(S.activeId)) || unplanned(at));
  // Another synced device may have logged this same run already.
  if (run && (t.sessions || []).some((s) => s.run === run)) return;
  t.sessions = [...(t.sessions || []), { at, ms: Math.round(ms), full, ...(run ? { run } : {}) }];
  Store.saveTask(t);
}
function flushPartial() {
  if (T.mode !== "focus" || T.status === "idle") return;
  const el = (T.total || dur("focus")) - remNow();
  if (el >= MIN) { logFocus(el, false, Date.now()); toast("Logged " + fmtDur(el) + " of focus."); }
}
function setMode(m, keep) {
  if (!keep) delete T.adj[T.mode];
  if (T.mode === "long" && m !== "long" && (T.status !== "idle" || T.setIndex >= S.settings.longEvery)) T.setIndex = 0;
  if (keep && T.status !== "idle") T.saved[T.mode] = { remaining: remNow(), total: T.total };
  const s = T.saved[m];
  delete T.saved[m];
  T.mode = m; T.status = s ? "paused" : "idle"; T.remaining = s ? s.remaining : null; T.endsAt = 0; T.total = s ? s.total : 0;
  cancelEnd(); wakeOff(); saveTimer(); renderTimer(true);
}
function start(from) {
  ensureAudio();
  if (preview()) { markStarted(); }
  if (T.status === "running") return;
  if (T.status === "idle") { T.total = base(T.mode); T.remaining = T.total; T.run = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); delete T.adj[T.mode]; }
  T.endsAt = (from || Date.now()) + T.remaining;
  T.status = "running";
  scheduleEnd(); saveTimer(); wakeOn(); renderTimer(true);
  autoFloat();
}
function pause() {
  if (T.status !== "running") return;
  T.remaining = Math.max(0, T.endsAt - Date.now()); T.status = "paused";
  cancelEnd(); saveTimer(); wakeOff(); renderTimer(true);
}
function complete(at) {
  const wasFocus = T.mode === "focus";
  const stale = Date.now() - at > MIN;
  timerQuiet = stale;
  try { advance(at, wasFocus, stale); } finally { timerQuiet = false; }
}
function advance(at, wasFocus, stale) {
  let next;
  if (wasFocus) {
    logFocus(T.total || dur("focus"), true, at, T.run);
    T.setIndex = (T.setIndex || 0) + 1;
    next = T.setIndex >= S.settings.longEvery ? "long" : "short";
    delete T.saved[next];
  } else next = "focus";
  const rang = pendingAt && Math.abs(pendingAt - at) < 2000;
  pending = []; pendingAt = 0; // let the bell that is ringing finish
  if (!rang && !stale) playSound(wasFocus ? "focus" : "break");
  if (!stale && !document.hidden) buzz([60, 80, 60]);
  setMode(next);
  const auto = wasFocus ? S.settings.autoBreak : S.settings.autoFocus;
  // Starting from the end time, not now, lets every synced device arrive at the same next phase.
  if (auto && !stale) start(at);
  const t = S.activeId && S.tasks.get(S.activeId);
  const msg = wasFocus ? ("Cycle done" + (t ? " on “" + t.title + "”" : "") + ". " + (next === "long" ? "Take a long break." : "Take a short break.")) : "Break's over. Ready for the next cycle.";
  toast(msg);
  if (!stale) notify(msg);
}
const toggle = () => (T.status === "running" ? pause() : start());
// Android only; iOS has no vibration API.
const buzz = (pattern) => { try { if (navigator.vibrate && matchMedia("(hover: none)").matches) navigator.vibrate(pattern); } catch {} };
const MAX_RUN = 180 * MIN;
function adjust(min) {
  const d = min * MIN, total = totalNow() + d, rem = remNow() + d;
  if (rem < MIN) { toast("A session needs at least a minute left."); return; }
  if (total > MAX_RUN) { toast("A session can't be longer than " + fmtDur(MAX_RUN) + "."); return; }
  if (T.status === "idle") T.adj[T.mode] = total - dur(T.mode);
  else {
    T.total = total; T.remaining = rem;
    if (T.status === "running") { T.endsAt += d; scheduleEnd(); }
  }
  saveTimer(); renderTimer(true);
}
function notify(body) {
  if (!S.settings.notify || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification("Pomodoro Ledger", { body, tag: "pomodoro-ledger" });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}
async function askNotify() {
  let p = "Notification" in window ? Notification.permission : "unsupported";
  if (p === "default") { try { p = await Notification.requestPermission(); } catch {} }
  if (p === "granted") return;
  S.settings.notify = false; $("#sNotify").checked = false; Store.saveSettings();
  toast(p === "unsupported" ? "This browser can't show notifications." : p === "denied" ? "Notifications are blocked for this site. Allow them in the browser's site settings." : "Notifications weren't allowed.");
}
// Skipping keeps the clock going if it was running.
function skip() { const run = T.status === "running"; flushPartial(); setMode(T.mode === "focus" ? "short" : "focus"); if (run) start(); }

// ---------- rendering: timer ----------
const ticksG = $("#ticks"), arc = $("#arc"), knob = $("#knob");
const R = 112, C = 2 * Math.PI * R;
arc.setAttribute("stroke-dasharray", C.toFixed(2));
const ticks = [];
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * 2 * Math.PI - Math.PI / 2, major = i % 5 === 0;
  const r1 = major ? 128 : 132, r2 = 142;
  const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
  l.setAttribute("x1", (150 + r1 * Math.cos(a)).toFixed(2)); l.setAttribute("y1", (150 + r1 * Math.sin(a)).toFixed(2));
  l.setAttribute("x2", (150 + r2 * Math.cos(a)).toFixed(2)); l.setAttribute("y2", (150 + r2 * Math.sin(a)).toFixed(2));
  l.setAttribute("class", "tick" + (major ? " major" : ""));
  ticksG.appendChild(l); ticks.push(l);
}
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
  steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l2 2 3-3.5M4 16l2 2 3-3.5M13 8h7M13 17h7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  star: '<svg class="ic-today" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 6h14M5 11h14M5 16h9"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5z"/><circle cx="8.5" cy="8.5" r="1.3"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.5v3.5M10.3 15.3l1.7 1.7 1.7-1.7"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
};
let lastTxt = "", lastLit = -1, lastBtn = "";
const MODE_NAME = { focus: "Focus", short: "Short break", long: "Long break" };
const clock = (secs) => pad(Math.floor(secs / 60)) + ":" + pad(secs % 60);
function renderTimer(force) {
  if (force) syncTicking();
  document.body.dataset.mode = T.mode;
  if (document.body.dataset.status !== T.status) document.body.dataset.status = T.status;
  const total = totalNow(), rem = remNow(), frac = Math.max(0, Math.min(1, rem / total));
  const secs = Math.ceil(rem / 1000), txt = clock(secs);
  if (txt !== lastTxt || force) {
    lastTxt = txt;
    $("#time").innerHTML = [...txt].map((c) => (c === ":" ? '<span class="c">:</span>' : '<span class="d">' + c + "</span>")).join("");
    $("#time").setAttribute("aria-label", Math.floor(secs / 60) + " minutes " + (secs % 60) + " seconds remaining");
    document.title = T.status === "idle" ? "Pomodoro Ledger" : txt + " · " + MODE_NAME[T.mode] + (T.status === "paused" ? " (paused)" : "");
  }
  arc.setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(2));
  const ang = frac * 2 * Math.PI - Math.PI / 2;
  knob.setAttribute("cx", (150 + R * Math.cos(ang)).toFixed(2)); knob.setAttribute("cy", (150 + R * Math.sin(ang)).toFixed(2));
  const lit = Math.ceil(frac * 60);
  if (lit !== lastLit || force) { lastLit = lit; ticks.forEach((l, i) => l.classList.toggle("lit", i < lit)); }
  renderFloating(txt, frac);
  renderTaskStarts(force);
  const tabTime = T.status === "running" ? txt : "Timer";
  if ($("#tabTime").textContent !== tabTime) $("#tabTime").textContent = tabTime;
  if (!force) return;
  roomPush();
  const every = S.settings.longEvery, idx = Math.min(T.setIndex || 0, every);
  $("#modeLabel").textContent = MODE_NAME[T.mode] + (T.mode === "focus" ? " · " + (Math.min(idx + 1, every)) + " of " + every : "");
  $("#dialSub").textContent = T.status === "running" ? "ends at " + fmtClock(T.endsAt) : T.status === "paused" ? "paused" : (total / MIN) + " min";
  const btn = T.status === "running" ? "pause" : T.status === "paused" ? "resume" : "start";
  if (btn !== lastBtn) {
    lastBtn = btn;
    $("#startBtn").innerHTML = (btn === "pause" ? ICON.pause + "Pause" : ICON.play + (btn === "resume" ? "Resume" : "Start"));
  }
  document.querySelectorAll(".modes button").forEach((b) => {
    const held = T.saved[b.dataset.mode];
    b.setAttribute("aria-selected", String(b.dataset.mode === T.mode));
    b.toggleAttribute("data-held", !!held);
    b.title = held ? "Paused with " + clock(Math.ceil(held.remaining / 1000)) + " left" : "";
  });
  let dots = "";
  for (let i = 0; i < every; i++) {
    const cls = i < idx ? "on" : i === idx && T.mode === "focus" && T.status === "running" ? "now" : "";
    dots += '<span class="' + cls + '"></span>';
  }
  $("#setDots").innerHTML = dots + "<em>" + (T.mode === "long" ? "long break" : (every - idx) + " to long break") + "</em>";
}

// ---------- task picker ----------
const pickBtn = $("#taskPick"), pickMenu = $("#pickMenu");
let pickOpts = [], pickOpen = false, pickIdx = 0;
function pickMove(i) {
  pickIdx = i;
  [...pickMenu.children].forEach((li, j) => li.classList.toggle("act", j === i));
  const li = pickMenu.children[i];
  if (!li) return;
  pickBtn.setAttribute("aria-activedescendant", li.id);
  if (li.offsetTop < pickMenu.scrollTop) pickMenu.scrollTop = li.offsetTop - 5;
  else if (li.offsetTop + li.offsetHeight > pickMenu.scrollTop + pickMenu.clientHeight) pickMenu.scrollTop = li.offsetTop + li.offsetHeight - pickMenu.clientHeight + 5;
}
function openPick() {
  pickOpen = true; pickMenu.hidden = false; pickBtn.setAttribute("aria-expanded", "true");
  pickMove(Math.max(0, pickOpts.findIndex((o) => o.id === (S.activeId || ""))));
}
function closePick() {
  pickOpen = false; pickMenu.hidden = true; pickBtn.setAttribute("aria-expanded", "false"); pickBtn.removeAttribute("aria-activedescendant");
}
function pickChoose(i) {
  const o = pickOpts[i];
  closePick();
  if (!o) return;
  if (preview()) { markStarted(); return; }
  S.activeId = o.id || null; saveTimer(); renderTasks();
}

// ---------- floating menu ----------
const pop = $("#pop");
let popItems = [], popCb = null, popAnchor = null, popIdx = 0;
function popMove(i) {
  popIdx = i;
  [...pop.children].forEach((li, j) => li.classList.toggle("act", j === i));
  if (pop.children[i]) pop.children[i].scrollIntoView({ block: "nearest" });
}
function openPop(anchor, items, cur, cb) {
  popItems = items; popCb = cb; popAnchor = anchor;
  pop.innerHTML = items.map((o, i) => '<li role="option" data-i="' + i + '" aria-selected="' + (o.id === cur) + '"' + (o.key ? ' aria-keyshortcuts="' + o.key + '"' : "") + "><span>" + esc(o.title) + "</span>" + (o.key ? "<kbd>" + o.key + "</kbd>" : "") + ICON.check + "</li>").join("");
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
  pop.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + "px";
  pop.style.top = (r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6) + "px";
  popMove(Math.max(0, items.findIndex((o) => o.id === cur)));
  pop.focus({ preventScroll: true });
}
function closePop(refocus) {
  if (pop.hidden) return;
  pop.hidden = true; popCb = null;
  if (refocus && popAnchor && popAnchor.isConnected) popAnchor.focus();
}
function popChoose(i) { const cb = popCb, o = popItems[i]; closePop(true); if (cb && o) cb(o.id); }

// ---------- reordering ----------
let drag = null;
const EASE = "cubic-bezier(.2, .8, .2, 1)";
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function groupBefore(ul, el) {
  let group = "later";
  for (const c of ul.children) { if (c === el) break; if (c.classList.contains("group")) group = c.dataset.g; }
  return group;
}
// Rows are hit-tested by layout position, so the sliding animations can't make the slot flicker back and forth.
function moveSlot(next) {
  const { ul, slot } = drag, rows = [...ul.children];
  const before = new Map(rows.map((el) => [el, el.getBoundingClientRect().top]));
  ul.insertBefore(slot, next);
  if (calm()) return;
  const top = ul.getBoundingClientRect().top;
  for (const el of rows) {
    const d = before.get(el) - (top + el.offsetTop);
    if (Math.abs(d) > 0.5) el.animate([{ transform: "translateY(" + d + "px)" }, { transform: "none" }], { duration: 220, easing: EASE });
  }
}
function updateDrop(y) {
  if (!drag || drag.settling) return;
  const { ul, slot, li } = drag;
  li.style.top = Math.max(0, Math.min(innerHeight - 40, y - drag.offset)) + "px";
  const top = ul.getBoundingClientRect().top;
  const rows = [...ul.children].filter((el) => el !== slot);
  const heading = rows.find((el) => { const t = top + el.offsetTop; return el.classList.contains("group") && y >= t && y <= t + el.offsetHeight; });
  let next = heading ? rows[rows.indexOf(heading) + 1] || null : rows.find((el) => y < top + el.offsetTop + el.offsetHeight / 2) || null;
  if (next === rows[0] && next?.classList.contains("group")) next = rows[1] || null;
  if (next !== slot.nextElementSibling) moveSlot(next);
  const group = groupBefore(ul, slot);
  if (group === drag.from) delete li.dataset.move; else li.dataset.move = "Move to " + groupName(group);
}
function dragScroll() {
  if (!drag || drag.settling) return;
  const bounds = drag.ul.getBoundingClientRect(), y = drag.y;
  const view = drag.scroller ? drag.scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const step = y < view.top + 64 && bounds.top < y ? -Math.ceil((view.top + 64 - y) / 5) : y > view.bottom - 64 && bounds.bottom > y ? Math.ceil((y - view.bottom + 64) / 5) : 0;
  if (step) { (drag.scroller || window).scrollBy(0, Math.max(-14, Math.min(14, step))); updateDrop(y); }
  drag.frame = requestAnimationFrame(dragScroll);
}
function finishDrag(cancel = false) {
  if (!drag || drag.settling) return;
  drag.settling = true;
  cancelAnimationFrame(drag.frame);
  try { drag.ul.releasePointerCapture(drag.id); } catch {}
  if (cancel) moveSlot(drag.next?.parentNode === drag.ul ? drag.next : null);
  const { ul, li, slot } = drag, taskId = li.dataset.id;
  const done = () => {
    li.getAnimations().forEach((a) => a.cancel());
    ul.insertBefore(li, slot);
    slot.remove(); li.classList.remove("dragging"); delete li.dataset.move;
    for (const name of ["top", "left", "width"]) li.style.removeProperty(name);
    ul.classList.remove("sorting"); drag = null; dragJustEnded = !cancel;
    setTimeout(() => { dragJustEnded = false; }, 0);
    S.dropped = cancel ? null : { id: taskId, at: Date.now() };
    if (cancel) renderTasks(); else commitOrder();
    [...ul.querySelectorAll(".task")].find((el) => el.dataset.id === taskId)?.querySelector(".grip")?.focus({ preventScroll: true });
  };
  if (calm()) { done(); return; }
  const to = slot.getBoundingClientRect();
  let ended = false;
  const end = () => { if (!ended) { ended = true; done(); } };
  li.animate([{ top: to.top + "px", left: to.left + "px", transform: "none", boxShadow: "none" }], { duration: 200, easing: EASE, fill: "forwards" }).finished.then(end, end);
  // Animations freeze in hidden tabs; don't leave the drop hanging.
  setTimeout(end, 300);
}
function commitOrder() {
  const changed = [];
  let g = S.taskView === "today" ? "today" : "later", end = "", i = 0;
  for (const el of $("#taskList").children) {
    if (el.classList.contains("group")) { g = el.dataset.g; end = el.dataset.end || ""; continue; }
    const t = S.tasks.get(el.dataset.id);
    if (!t) continue;
    const n = placed(t, end && t.plan >= g && t.plan <= end ? t.plan : g, i);
    if (t.order !== i || !!t.today !== n.today || (t.plan || "") !== (n.plan || "") || (t.section || "") !== (n.section || "")) changed.push(n);
    i++;
  }
  if (changed.length) Store.saveTasks(changed); else renderTasks();
}

// ---------- sessions ----------
function sesAt(key) {
  const k = key.lastIndexOf(":"), t = S.tasks.get(key.slice(0, k)), i = +key.slice(k + 1);
  return t && t.sessions && t.sessions[i] ? { t, i } : null;
}
function deleteSession(key) {
  const r = sesAt(key); if (!r) return;
  const n = clone(r.t); n.sessions.splice(r.i, 1);
  if (n.system && !n.sessions.length) Store.deleteTask(n.id); else Store.saveTask(n);
  toast("Deleted that session.");
}
function moveSession(key, toId) {
  const r = sesAt(key); if (!r) return;
  const s = r.t.sessions[r.i], dst = clone((toId && S.tasks.get(toId)) || unplanned(s.at));
  if (dst.id === r.t.id) return;
  const src = clone(r.t); src.sessions.splice(r.i, 1);
  dst.sessions = [...(dst.sessions || []), clone(s)].sort((a, b) => a.at - b.at);
  if (src.system && !src.sessions.length) { Store.deleteTask(src.id); Store.saveTask(dst); } else Store.saveTasks([src, dst]);
  toast("Moved to “" + dst.title + "”.");
}
function labelSession(key, name) {
  const r = sesAt(key); if (!r) return;
  const task = clone(r.t);
  task.sessions[r.i].project = name ? Labels.use(name) : "";
  Store.saveTask(task);
  toast(name ? "Session labeled “" + task.sessions[r.i].project + "”." : "Label removed from this session.");
}
function moveItems() {
  const fin = [...S.tasks.values()].filter((t) => t.done && !t.system).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return [{ id: "", title: "Unplanned focus (no task)" }]
    .concat(openOf(S.tasks).map((t) => ({ id: t.id, title: t.title })))
    .concat(fin.map((t) => ({ id: t.id, title: t.title + " (finished)" })));
}
function renderSessions(vt, filter = "") {
  const all = [];
  for (const t of vt.values()) (t.sessions || []).forEach((s, i) => { if (matchesLabel(sessionProject(t, s), filter)) all.push({ t, i, s }); });
  all.sort((a, b) => b.s.at - a.s.at);
  const tb = $("#sesTable");
  if (!all.length) {
    tb.innerHTML = "";
    $("#sesFoot").innerHTML = '<div class="empty"><strong>No sessions yet</strong><span>Every focus block you run is listed here, so you can move it to another task or delete it.</span></div>';
    return;
  }
  const rows = all.slice(0, S.logN).map(({ t, i, s }) => {
    const key = t.id + ":" + i;
    const name = sessionProject(t, s);
    const label = '<button class="meta-chip session-label' + (name ? "" : " none") + '" type="button" data-session-label aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(name ? "Session label: " + name + ". Change label" : "Add a label to this session") + '" title="Change label for this session">' + labelChipInner(name) + '</button>';
    return '<tr data-ses="' + esc(key) + '"><td class="mono">' + fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" }) + " · " + fmtClock(s.at) + "</td>" +
      '<td class="t"><button class="move" type="button" data-move aria-haspopup="listbox" title="Move to another task"><span>' + esc(t.title) + "</span>" + ICON.chev + "</button> " + label + "</td>" +
      '<td class="num">' + fmtDur(s.ms) + '</td><td><span class="chip">' + (s.full ? "Cycle" : "Partial") + "</span></td>" +
      '<td class="num">' + (S.confirmSes === key ? '<button class="icon-btn danger" type="button" data-sdel>Delete?</button>' : '<button class="icon-btn" type="button" data-sdel aria-label="Delete this session" title="Delete">' + ICON.trash + "</button>") + "</td></tr>";
  }).join("");
  tb.innerHTML = '<thead><tr><th>When</th><th>Task</th><th class="num">Length</th><th>Type</th><th class="num"><span hidden>Actions</span></th></tr></thead><tbody>' + rows + "</tbody>";
  labelTable(tb);
  $("#sesFoot").innerHTML = all.length > S.logN ? '<button class="link" type="button" id="sesMore">Show ' + Math.min(20, all.length - S.logN) + " more</button>" : "";
}

// ---------- full screen ----------
function setZen(on) {
  document.body.classList.toggle("zen", on);
  document.querySelectorAll(".bar, .room, .banner, .panel, .progress, .tabbar").forEach((el) => (el.inert = on));
  const b = $("#fullBtn"), label = on ? "Exit full screen" : "Full screen";
  b.innerHTML = on ? ICON.shrink : ICON.expand; b.setAttribute("aria-label", label);
  b.title = on ? label : "Fill the page (F) · Shift-click for browser full screen (Shift+F)";
}
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function browserFull(on) {
  const root = document.documentElement;
  try {
    const fn = on ? root.requestFullscreen || root.webkitRequestFullscreen : document.exitFullscreen || document.webkitExitFullscreen;
    const p = fn && fn.call(on ? root : document);
    if (p && p.catch) p.catch(() => {});
  } catch {}
}
function toggleZen(native) {
  if (phone() && document.body.dataset.page !== "timer") showPage("timer");
  const on = native ? !fsEl() : !document.body.classList.contains("zen");
  setZen(on);
  if (fsEl() ? !on : on && native) browserFull(on);
}
["fullscreenchange", "webkitfullscreenchange"].forEach((ev) => document.addEventListener(ev, () => { if (!fsEl()) setZen(false); }));

// ---------- floating timer ----------
// A second view of the same timer: no separate state, logs, or room connection.
let floatWindow = null, floatOpening = false;
const floatBtn = $("#floatBtn");
floatBtn.hidden = !window.documentPictureInPicture || !window.isSecureContext;
$("#autoFloatRow").hidden = floatBtn.hidden;
function renderFloating(txt, frac) {
  if (!floatWindow || floatWindow.closed) return;
  const doc = floatWindow.document, root = doc.documentElement;
  const theme = getComputedStyle(document.body);
  for (const name of ["--bg", "--surface", "--surface-2", "--fg", "--muted", "--faint", "--line", "--line-2", "--accent", "--tomato", "--on-accent", "--shadow", "--glow-o", "--f-display", "--f-body", "--f-mono"]) {
    root.style.setProperty(name, theme.getPropertyValue(name));
  }
  root.style.colorScheme = getComputedStyle(document.documentElement).colorScheme;
  doc.title = txt + " · " + MODE_NAME[T.mode];
  const every = S.settings.longEvery, idx = Math.min(T.setIndex || 0, every);
  doc.getElementById("miniMode").textContent = MODE_NAME[T.mode] + (T.mode === "focus" ? " · " + Math.min(idx + 1, every) + " of " + every : "");
  const time = doc.getElementById("miniTime");
  time.innerHTML = [...txt].map((c) => (c === ":" ? '<span class="c">:</span>' : '<span class="d">' + c + "</span>")).join("");
  const secs = Math.ceil(remNow() / 1000);
  time.setAttribute("aria-label", Math.floor(secs / 60) + " minutes " + (secs % 60) + " seconds remaining");
  doc.getElementById("miniSub").textContent = T.status === "running" ? "ends at " + fmtClock(T.endsAt) : T.status === "paused" ? "paused" : (totalNow() / MIN) + " min";
  const task = S.activeId && S.tasks.get(S.activeId);
  const taskEl = doc.getElementById("miniTask");
  taskEl.textContent = task ? task.title : T.mode === "focus" ? "Time to focus" : "Take a breather";
  taskEl.title = task ? task.title : "";
  doc.getElementById("miniProgress").style.width = (frac * 100) + "%";
  const [less, more] = doc.querySelectorAll(".step button");
  less.disabled = remNow() < 2 * MIN;
  more.disabled = totalNow() + MIN > MAX_RUN;
  const button = doc.getElementById("miniToggle");
  const label = T.status === "running" ? "Pause" : T.status === "paused" ? "Resume" : "Start";
  if (button.getAttribute("aria-label") !== label) {
    button.innerHTML = (T.status === "running" ? ICON.pause : ICON.play) + label;
    button.setAttribute("aria-label", label);
  }
}
floatBtn.addEventListener("click", () => {
  if (floatWindow && !floatWindow.closed) floatWindow.close();
  else openFloating();
});
function autoFloatHandler() {
  if (!navigator.mediaSession) return;
  try { navigator.mediaSession.setActionHandler("enterpictureinpicture", S.settings.autoFloat && !floatBtn.hidden ? () => openFloating(true) : null); } catch {}
}
function autoFloat() {
  if (S.settings.autoFloat && !floatBtn.hidden && navigator.userActivation?.isActive && !(floatWindow && !floatWindow.closed)) openFloating(true);
}
async function openFloating(quiet) {
  if (floatOpening || (floatWindow && !floatWindow.closed)) return;
  floatOpening = true;
  let opened = null;
  try {
    opened = await window.documentPictureInPicture.requestWindow({ width: 300, height: 184 });
    const doc = opened.document;
    const fontLink = document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
    if (fontLink) doc.head.appendChild(fontLink.cloneNode());
    const style = doc.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg); }
      body { padding: 6px; font: 13px/1.4 var(--f-body); -webkit-font-smoothing: antialiased; }
      main { position: relative; isolation: isolate; width: 100%; height: 100%; min-height: 0; overflow: hidden; padding: 10px 12px 11px; display: grid; grid-template-rows: auto auto 6px auto 36px; gap: 6px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: var(--shadow); }
      .glow { position: absolute; z-index: -1; width: 280px; aspect-ratio: 1; left: 25%; top: 35%; translate: -50% -50%; border-radius: 50%; background: var(--accent); opacity: var(--glow-o); filter: blur(56px); pointer-events: none; }
      .meta { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      #miniMode { overflow: hidden; color: var(--accent); font-size: 9.5px; font-weight: 650; letter-spacing: .1em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
      #miniSub { flex: none; color: var(--muted); font: 9.5px/1.2 var(--f-mono); white-space: nowrap; }
      .time-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .step { display: flex; gap: 4px; opacity: .55; transition: opacity .15s; }
      main:hover .step, .step:focus-within { opacity: 1; }
      .step button { width: 30px; height: 26px; border-radius: 999px; font: 550 11px var(--f-mono); }
      .step button:disabled { opacity: .35; cursor: default; transform: none; }
      .step button:disabled:hover { background: var(--surface-2); color: var(--muted); }
      #miniTime { font: 650 clamp(42px, 17vw, 52px)/.9 var(--f-display); letter-spacing: -.02em; font-variation-settings: "opsz" 96; font-variant-numeric: tabular-nums; white-space: nowrap; }
      #miniTime .d { display: inline-block; width: .6em; text-align: center; }
      #miniTime .c { display: inline-block; width: .28em; text-align: center; translate: 0 -.06em; }
      .progress { overflow: hidden; height: 6px; border-radius: 999px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
      #miniProgress { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .25s linear, background .8s; }
      .task { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
      .task-label { flex: none; color: var(--faint); font-size: 8.5px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; }
      #miniTask { min-width: 0; overflow: hidden; color: var(--fg); font-family: var(--f-display); font-size: 12.5px; font-weight: 650; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
      .actions { display: grid; grid-template-columns: 36px minmax(92px, 1fr) 36px; align-items: center; gap: 8px; }
      button { height: 36px; padding: 0; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); font: 550 12.5px var(--f-body); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: background .15s, color .15s, transform .1s; }
      .round { border-radius: 50%; }
      button:hover { background: var(--surface); color: var(--fg); }
      button:active { transform: scale(.96); }
      button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      button svg { width: 16px; height: 16px; }
      #miniToggle { border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-family: var(--f-display); font-size: 13.5px; font-weight: 700; box-shadow: 0 8px 18px -10px var(--accent); }
      #miniToggle:hover { background: var(--accent); color: var(--on-accent); filter: brightness(.96); }
      @media (max-height: 175px) {
        body { padding: 4px; }
        main { padding: 7px 10px 8px; grid-template-rows: auto auto 5px auto 32px; gap: 4px; border-radius: 17px; }
        #miniTime { font-size: clamp(36px, 15vw, 46px); }
        .actions { grid-template-columns: 32px minmax(80px, 1fr) 32px; gap: 7px; }
        button { height: 32px; }
      }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `;
    doc.head.appendChild(style);
    doc.body.innerHTML = '<main aria-label="Floating Pomodoro timer"><div class="glow" aria-hidden="true"></div><div class="meta"><div id="miniMode"></div><div id="miniSub"></div></div><div class="time-row"><div id="miniTime" role="timer" aria-label="Time remaining"></div><div class="step" role="group" aria-label="Adjust this session"><button type="button" data-adj="-1" aria-label="1 minute less" title="1 minute less (−)">−1</button><button type="button" data-adj="1" aria-label="1 minute more" title="1 minute more (+)">+1</button></div></div><div class="progress" aria-hidden="true"><i id="miniProgress"></i></div><div class="task"><span class="task-label">Working on</span><span id="miniTask"></span></div><div class="actions"><button class="round" id="miniReset" type="button" aria-label="Reset timer" title="Reset timer">' + ICON.undo + '</button><button id="miniToggle" type="button"></button><button class="round" id="miniSkip" type="button" aria-label="Skip to next phase" title="Skip to next phase">' + $("#skipBtn").innerHTML + '</button></div></main>';
    doc.getElementById("miniToggle").addEventListener("click", toggle);
    doc.getElementById("miniReset").addEventListener("click", () => { flushPartial(); setMode(T.mode); });
    doc.getElementById("miniSkip").addEventListener("click", skip);
    doc.querySelector(".step").addEventListener("click", (e) => { const b = e.target.closest("[data-adj]"); if (b) adjust(+b.dataset.adj); });
    doc.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space" && e.target === doc.body && !e.repeat) { e.preventDefault(); toggle(); }
      else if (e.key === "+" || e.key === "=") adjust(1);
      else if (e.key === "-") adjust(-1);
    });
    floatWindow = opened;
    // Keep the visible mini clock fresh even when the main tab is in the background.
    const interval = opened.setInterval(tick, 250);
    opened.addEventListener("pagehide", () => {
      opened.clearInterval(interval);
      if (floatWindow !== opened) return;
      floatWindow = null;
      floatBtn.setAttribute("aria-pressed", "false");
      floatBtn.setAttribute("aria-label", "Open floating timer");
      floatBtn.title = "Open floating timer";
    }, { once: true });
    floatBtn.setAttribute("aria-pressed", "true");
    floatBtn.setAttribute("aria-label", "Close floating timer");
    floatBtn.title = "Close floating timer";
    tick();
  } catch {
    if (opened) opened.close();
    if (!quiet) toast("Couldn't open the floating timer. Try again from a supported desktop browser.");
  } finally { floatOpening = false; }
}
autoFloatHandler();

// ---------- rendering: tasks ----------
function pipsHTML(t) {
  const c = cyclesOf(t), est = t.est || 0, n = Math.max(c, est);
  if (n > 12) {
    const pct = est ? Math.min(100, (c / est) * 100) : 100;
    return '<span class="mini" aria-hidden="true"><b style="width:' + pct + '%"></b></span>';
  }
  let h = '<span class="pips" aria-hidden="true">';
  for (let i = 0; i < n; i++) h += "<i class=\"" + (i < c ? (i >= est ? "o" : "f") : "") + "\"></i>";
  return h + "</span>";
}
function metaText(t) {
  const c = cyclesOf(t), est = t.est || 0, over = c - est;
  let s = c + "/" + est + " cycles";
  if (est && over > 0) s += ' <span class="over">+' + over + " over</span>";
  const ms = timeOf(t);
  if (ms) s += " · " + fmtDur(ms) + " focus";
  return s;
}
const projectOf = (t) => typeof t.project === "string" ? t.project.trim() : "";
const sessionProject = (t, s) => Object.hasOwn(s, "project") ? projectOf(s) : projectOf(t);
const matchesLabel = (name, f) => !f || (f === "none" ? !name : name === f.slice(8));
const projectNames = (tasks) => [...new Set([...tasks.values()].filter((t) => !t.system).map(projectOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const progressLabelNames = (tasks) => [...new Set([...projectNames(tasks), ...[...tasks.values()].flatMap((t) => (t.sessions || []).map((s) => sessionProject(t, s))).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
const matchLabel = (t, f) => matchesLabel(projectOf(t), f);
function focusTasks(tasks, filter) {
  if (!filter) return tasks;
  return new Map([...tasks].map(([id, t]) => [id, { ...t, sessions: (t.sessions || []).filter((s) => matchesLabel(sessionProject(t, s), filter)) }])
    .filter(([, t]) => t.sessions.length || matchLabel(t, filter)));
}
const inProject = (t) => matchLabel(t, S.projectFilter);
const labelHidden = (name) => S.labels.some((l) => l.archived && l.name.toLocaleLowerCase() === name.toLocaleLowerCase());
const Labels = {
  merge(list) {
    const byName = new Map();
    for (const label of [...S.labels, ...list]) {
      if (!label || typeof label.name !== "string" || !label.name.trim()) continue;
      const name = label.name.trim().slice(0, 80), key = name.toLocaleLowerCase(), old = byName.get(key);
      if (!old || (label.updatedAt || 0) >= (old.updatedAt || 0)) byName.set(key, { name, lastUsed: Number(label.lastUsed) || 0, archived: !!label.archived, updatedAt: Number(label.updatedAt) || 0 });
    }
    S.labels = [...byName.values()];
  },
  importTasks(tasks) {
    let changed = false;
    for (const t of tasks.values()) {
      for (const name of [projectOf(t), ...(t.sessions || []).map((s) => sessionProject(t, s))]) {
        if (!name || S.labels.some((l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
        S.labels.push({ name, lastUsed: t.updatedAt || t.createdAt || 0, archived: false, updatedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) Store.saveSettings();
  },
  add(name, used = false) {
    name = name.trim().slice(0, 80);
    if (!name) return "";
    let label = S.labels.find((l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!label) { label = { name, lastUsed: 0, archived: false }; S.labels.push(label); }
    label.archived = false;
    label.updatedAt = Date.now();
    if (used) label.lastUsed = Date.now();
    Store.saveSettings(); refreshLabelPop();
    return label.name;
  },
  use(name) { return this.add(name, true); },
};
const LABEL_HUES = [25, 60, 100, 150, 195, 245, 290, 335];
const sameLabel = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
function labelHue(name) {
  let h = 0;
  for (const c of name.toLocaleLowerCase()) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return LABEL_HUES[h % LABEL_HUES.length];
}
const labelDot = (name) => '<i class="label-dot" style="--h:' + labelHue(name) + '"></i>';
const labelChipInner = (name) => (name ? labelDot(name) : ICON.tag) + "<span>" + esc(name || "Label") + "</span>";
const labelChipName = (name) => name ? "Label: " + name + ". Change label" : "Add a label";
function projectHTML(t, pick) {
  const project = projectOf(t);
  if (pick) return '<button class="meta-chip' + (project ? "" : " none") + '" type="button" data-act="label" aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(labelChipName(project)) + '" title="' + (project ? "Change label" : "Add a label") + '">' + labelChipInner(project) + "</button>";
  return project ? '<span class="meta-chip" title="Label: ' + esc(project) + '">' + labelChipInner(project) + "</span>" : "";
}

// ---------- label picker ----------
const labelPop = $("#labelPop"), labelSearch = $("#labelSearch"), labelOpts = $("#labelOpts");
const LP = { key: "", find: null, cb: null, value: "", query: "", opts: [], idx: -1, manage: false, skip: "" };
const labelAnchor = () => (LP.find ? LP.find() : null);
function labelMatches(q) {
  q = q.toLocaleLowerCase();
  const starts = (l) => (l.name.toLocaleLowerCase().startsWith(q) ? 0 : 1);
  return S.labels.filter((l) => !l.archived && l.name.toLocaleLowerCase().includes(q)).sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
}
function labelMove(i) {
  LP.idx = i;
  [...labelOpts.children].forEach((li, j) => li.classList.toggle("act", j === i));
  const li = labelOpts.children[i];
  if (!li || i < 0) { labelSearch.removeAttribute("aria-activedescendant"); return; }
  labelSearch.setAttribute("aria-activedescendant", li.id);
  const top = li.offsetTop - labelOpts.offsetTop;
  if (top < labelOpts.scrollTop) labelOpts.scrollTop = top;
  else if (top + li.offsetHeight > labelOpts.scrollTop + labelOpts.clientHeight) labelOpts.scrollTop = top + li.offsetHeight - labelOpts.clientHeight;
}
function renderLabelPop() {
  const q = LP.query.trim(), hash = LP.key === "hash";
  let opts, idx = -1;
  if (LP.manage) opts = [...S.labels].sort((a, b) => a.name.localeCompare(b.name));
  else {
    opts = labelMatches(q).map((l) => ({ name: l.name }));
    const first = opts.length ? 0 : -1;
    if (q && !opts.some((o) => sameLabel(o.name, q))) opts.push({ name: q, create: true });
    if (!q && LP.value) opts.unshift({ name: "", clear: true });
    idx = q ? first : opts.findIndex((o) => !o.clear && sameLabel(o.name, LP.value));
    // "#12" in a title is far more often an issue number than a new label
    if (idx < 0 && opts.length && !(hash && /^\d+$/.test(q))) idx = opts.findIndex((o) => !o.clear);
  }
  LP.opts = opts;
  labelOpts.setAttribute("role", LP.manage ? "list" : "listbox");
  labelOpts.innerHTML = opts.length ? opts.map((o, i) => {
    if (LP.manage) return '<li class="plain' + (o.archived ? " off" : "") + '">' + labelDot(o.name) + "<span>" + esc(o.name) + '</span><button class="btn small" type="button" data-label-archive="' + esc(o.name) + '">' + (o.archived ? "Restore" : "Hide") + "</button></li>";
    const sel = !o.create && !o.clear && sameLabel(o.name, LP.value);
    return '<li role="option" id="label-opt-' + i + '" data-i="' + i + '" aria-selected="' + sel + '">' + (o.create ? "<b>+</b><span>Create “" + esc(o.name) + "”</span>" : o.clear ? '<i class="label-dot none"></i><span>No label</span>' : labelDot(o.name) + "<span>" + esc(o.name) + "</span>") + (sel ? ICON.check : "") + "</li>";
  }).join("") : '<li class="plain empty-note">' + (LP.manage ? "No labels yet." : "No labels yet. Type a name to create your first one.") + "</li>";
  $("#labelPopHint").textContent = LP.manage ? "Hidden labels aren’t suggested" : LP.key.startsWith("session:") ? "Applies only to this session" : "Or type # in a new task";
  $("#labelManage").textContent = LP.manage ? "Done" : "Manage";
  labelMove(idx);
}
function placeLabelPop() {
  const a = labelAnchor();
  if (!a) return;
  const r = a.getBoundingClientRect();
  labelPop.style.left = Math.max(12, Math.min(r.left, document.documentElement.clientWidth - labelPop.offsetWidth - 12)) + scrollX + "px";
  labelPop.style.top = r.bottom + 6 + scrollY + "px";
}
function openLabelPop(key, find, value, cb) {
  const toggled = LP.skip === key;
  LP.skip = "";
  closeLabelPop(toggled);
  if (toggled) return;
  const hash = key === "hash";
  Object.assign(LP, { key, find, cb, value: value || "", query: "", manage: false });
  labelSearch.value = ""; labelSearch.hidden = hash; $("#labelPopFoot").hidden = hash;
  labelPop.hidden = false;
  if (!hash) find().setAttribute("aria-expanded", "true");
  placeLabelPop(); renderLabelPop();
  if (!hash) labelSearch.focus({ preventScroll: true });
  labelPop.scrollIntoView({ block: "nearest" });
}
function closeLabelPop(refocus) {
  if (labelPop.hidden) return;
  const a = labelAnchor();
  labelPop.hidden = true;
  LP.find = LP.cb = null;
  if (!a) return;
  if (LP.key !== "hash") a.setAttribute("aria-expanded", "false");
  if (refocus) a.focus();
}
function chooseLabel(i) {
  const o = LP.opts[i], cb = LP.cb;
  if (!o || LP.manage) return;
  closeLabelPop(true);
  cb(o.clear ? "" : o.name);
}
function refreshLabelPop() { if (!labelPop.hidden) renderLabelPop(); }
function labelKey(e) {
  const k = e.key, last = LP.opts.length - 1;
  if (k === "Escape") closeLabelPop(true);
  else if (LP.manage) return;
  else if (k === "ArrowDown") labelMove(LP.idx >= last ? 0 : LP.idx + 1);
  else if (k === "ArrowUp") labelMove(LP.idx <= 0 ? last : LP.idx - 1);
  else if (k === "Enter" && LP.idx >= 0) chooseLabel(LP.idx);
  else return;
  e.preventDefault(); e.stopPropagation();
}
labelSearch.addEventListener("input", () => { LP.query = labelSearch.value; renderLabelPop(); });
labelPop.addEventListener("mousedown", (e) => { if (e.target !== labelSearch) e.preventDefault(); });
labelPop.addEventListener("pointermove", (e) => { const li = e.target.closest("li[data-i]"); if (li && +li.dataset.i !== LP.idx) labelMove(+li.dataset.i); });
labelPop.addEventListener("click", (e) => {
  const hide = e.target.closest("[data-label-archive]"), li = e.target.closest("li[data-i]");
  if (hide) {
    const label = S.labels.find((l) => l.name === hide.dataset.labelArchive);
    if (!label) return;
    label.archived = !label.archived; label.updatedAt = Date.now();
    Store.saveSettings(); renderLabelPop(); renderTasks();
  } else if (e.target.id === "labelManage") {
    LP.manage = !LP.manage; LP.query = labelSearch.value = "";
    renderLabelPop(); labelSearch.focus();
  } else if (li) chooseLabel(+li.dataset.i);
});
labelPop.addEventListener("keydown", (e) => {
  const inSearch = e.target === labelSearch;
  if (e.key === "Tab" && (inSearch ? e.shiftKey : !e.shiftKey && e.target.id === "labelManage")) { e.preventDefault(); closeLabelPop(true); }
  else if (inSearch || e.key === "Escape") labelKey(e);
});
document.addEventListener("pointerdown", (e) => {
  LP.skip = "";
  if (labelPop.hidden || labelPop.contains(e.target)) return;
  const a = labelAnchor();
  if (a && a.contains(e.target) && LP.key !== "hash") LP.skip = LP.key;
  else if (!a || !a.contains(e.target)) closeLabelPop();
});
addEventListener("resize", placeLabelPop);
const subsOf = (t) => (Array.isArray(t.subtasks) ? t.subtasks : []);
const subOpen = (t) => S.openTask === t.id;
function subCountHTML(t) {
  const subs = subsOf(t), done = subs.filter((s) => s.done).length, open = subOpen(t);
  const name = subs.length ? done + " of " + plural(subs.length, "subtask") + " done. " + (open ? "Hide" : "Show") + " subtasks" : "Add subtasks";
  return '<button class="meta-chip' + (subs.length ? (done === subs.length ? " all-done" : "") : " none") + '" type="button" data-act="subtasks" aria-expanded="' + open + '" aria-label="' + name + '" title="' + (subs.length ? (open ? "Hide subtasks" : "Show subtasks") : "Add subtasks") + '">' + ICON.steps + "<span>" + (subs.length ? done + "/" + subs.length : "Subtasks") + "</span></button>";
}
function subtasksHTML(t, archive = false) {
  const subtasks = subsOf(t);
  if (archive) return subtasks.length ? '<details class="subtask-archive"><summary>Subtasks · ' + subtasks.filter((s) => s.done).length + "/" + subtasks.length + ' done</summary><ul>' + subtasks.map((s) => '<li>' + (s.done ? "✓ " : "○ ") + esc(s.title) + "</li>").join("") + "</ul></details>" : "";
  if (!subOpen(t)) return "";
  return '<div class="subplan"><ul class="subtasks">' +
    subtasks.map((s) => '<li class="subtask" data-subid="' + esc(s.id) + '" data-done="' + !!s.done + '"><input type="checkbox" data-subdone aria-label="Complete subtask: ' + esc(s.title) + '"' + (s.done ? " checked" : "") + '><input type="text" data-subtitle maxlength="140" aria-label="Subtask title" value="' + esc(s.title) + '"><button class="icon-btn" type="button" data-act="subdelete" aria-label="Delete subtask: ' + esc(s.title) + '" title="Delete subtask">' + ICON.trash + "</button></li>").join("") +
    '</ul><form class="subtask-add" autocomplete="off"><input type="text" maxlength="140" aria-label="New subtask for ' + esc(t.title) + '" placeholder="' + (subtasks.length ? "Add another step" : "Add a step, e.g. Draft the outline") + '" value="' + esc(S.subtaskDrafts.get(t.id) || "") + '"><button class="btn small" type="submit">Add</button></form></div>';
}
let startEstimateMinute = -1, renderedDay = "";
const completing = new Map();
// Circles to click, like the original picker; the row grows when the estimate goes past it.
function estCircles(est, attr) {
  let h = "";
  for (let i = 1, n = Math.min(16, Math.max(8, est + 1)); i <= n; i++) h += '<button type="button" role="radio" aria-checked="' + (i === est) + '" aria-label="' + plural(i, "cycle") + '" ' + attr + '="' + i + '" class="' + (i <= est ? "on" : "") + '"><i></i></button>';
  return '<span class="est-pick" role="radiogroup" aria-label="Estimated cycles">' + h + "</span>";
}
function whenLabel(t) {
  const b = bucketOf(t);
  return b === "today" ? ICON.star + "Today" : b === "later" ? ICON.cal + "When" : ICON.cal + esc(dayName(t.plan));
}
function cardHTML(t, del) {
  const est = t.est || 0, c = cyclesOf(t), ms = timeOf(t);
  return '<div class="task-card">' +
    '<input class="card-title" type="text" data-field="title" maxlength="140" value="' + esc(t.title) + '" aria-label="Title">' +
    '<textarea class="card-notes" data-field="notes" rows="1" maxlength="4000" placeholder="Notes" aria-label="Notes">' + esc(t.notes || "") + "</textarea>" +
    subtasksHTML(t) +
    '<div class="card-bar">' +
      '<button class="card-btn' + (bucketOf(t) === "later" ? "" : " set") + '" type="button" data-act="sched" data-sched aria-haspopup="dialog" title="When? (D)">' + whenLabel(t) + "</button>" +
      '<button class="card-btn' + (projectOf(t) ? " set" : "") + '" type="button" data-act="label" aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(labelChipName(projectOf(t))) + '">' + (projectOf(t) ? labelDot(projectOf(t)) + esc(projectOf(t)) : ICON.tag + "Label") + "</button>" +
      '<span class="card-est">' + estCircles(est, "data-cest") + "<output>" + plural(est, "cycle") + "</output></span>" +
      '<span class="spacer"></span>' +
      (del ? '<button class="icon-btn danger" type="button" data-act="del">Delete?</button>' : '<button class="icon-btn" type="button" data-act="del" aria-label="Delete task" title="Delete">' + ICON.trash + "</button>") +
      '<button class="btn small solid" type="button" data-act="focus">' + ICON.play + "Focus</button>" +
    "</div>" +
    '<div class="card-stats">' + c + " of " + plural(t.est || 0, "cycle") + (ms ? " · " + fmtDur(ms) + " focus" : "") + (isToday(t) ? '<span class="task-start"></span>' : "") + (t.createdAt > 1 ? " · added " + esc(fmtDate(t.createdAt)) : "") + "</div>" +
  "</div>";
}
function taskStartPlan() {
  const today = openOf(viewTasks()).filter(isToday), plan = new Map();
  const current = T.mode === "focus" && T.status !== "idle" ? today.find((t) => t.id === S.activeId) : null;
  const sequence = current ? [current, ...today.filter((t) => t !== current)] : today;
  const remaining = (t) => Math.max(t === current ? 1 : 0, (t.est || 0) - cyclesOf(t));
  let cursor = Date.now(), index = T.mode === "long" ? 0 : T.setIndex || 0;
  const nextBreak = () => {
    if (index >= S.settings.longEvery) { index = 0; return dur("long"); }
    return dur("short");
  };
  plan.segs = [];
  if (T.mode !== "focus") { cursor += remNow(); plan.segs.push({ k: "b", ms: remNow() }); }
  else if (T.status !== "idle" && !current) { cursor += remNow(); index++; const b = nextBreak(); cursor += b; plan.segs.push({ k: "o", ms: remNow() }, { k: "b", ms: b }); }
  let cyclesLeft = sequence.reduce((n, t) => n + remaining(t), 0);
  plan.focus = 0; plan.breaks = 0; plan.late = []; plan.rest = []; plan.start = Date.now();
  const we = S.settings.workdayEnd, endAt = we ? sod(Date.now()) + (+we.slice(0, 2)) * 3600000 + (+we.slice(3)) * MIN : Infinity;
  // Once the workday is over every task is "late", so stop flagging and just offer to move what's left.
  plan.endAt = endAt; plan.over = Date.now() >= endAt;
  for (const t of sequence) {
    const cycles = remaining(t);
    if (!cycles) { plan.set(t.id, { text: "Estimate met", hint: "All estimated cycles for this task are complete. Increase the estimate to plan more time." }); continue; }
    const start = cursor;
    let end = cursor;
    for (let i = 0; i < cycles; i++) {
      const focus = t === current && i === 0 ? remNow() : dur("focus");
      cursor += focus; plan.focus += focus; end = cursor; plan.segs.push({ k: "f", ms: focus });
      index++; cyclesLeft--;
      if (cyclesLeft) { const rest = nextBreak(); cursor += rest; plan.breaks += rest; plan.segs.push({ k: "b", ms: rest }); }
    }
    const late = !plan.over && t !== current && end > endAt;
    if (late) plan.late.push(t.id);
    if (t !== current) plan.rest.push(t.id);
    plan.set(t.id, { late, start, end, text: t === current ? T.status === "running" ? "In progress" : "Resume now" : "Starts ~" + fmtClock(start),
      hint: (t === current ? "Estimated to finish ~" + fmtClock(end) : "Estimated ~" + fmtClock(start) + " – " + fmtClock(end)) + ", including the short and long breaks in your settings. " + (current ? "Finish the current task first, then follow Today’s order." : "Tasks follow Today’s order; paused timers are assumed to resume now.") });
  }
  plan.end = cursor;
  return plan;
}
function renderTaskStarts(force = false) {
  if (drag) return;
  if (renderedDay !== todayKey()) { renderTasks(); return; }
  const minute = Math.floor(Date.now() / MIN);
  if (!force && minute === startEstimateMinute) return;
  startEstimateMinute = minute;
  const plan = taskStartPlan();
  document.querySelectorAll("#taskList .task-start").forEach((el) => {
    const estimate = plan.get(el.closest(".task").dataset.id), inCard = !!el.closest(".card-stats");
    el.textContent = estimate ? (inCard ? " · " + estimate.text.replace(/^Starts/, "starts") : estimate.text) : "";
    el.title = estimate ? estimate.hint : "";
    el.classList.toggle("late", !!(estimate && estimate.late));
  });
  document.querySelectorAll("#taskList .late-flag").forEach((el) => {
    const estimate = plan.get(el.closest(".task").dataset.id);
    el.hidden = !(estimate && estimate.late);
    el.title = el.hidden ? "" : "Won't finish before " + fmtClock(plan.endAt) + " · " + estimate.text;
  });
  const fit = $("#dayFit"), ids = plan.over ? plan.rest : plan.late;
  fit.hidden = S.taskView !== "today" || !ids.length || preview();
  fit.classList.toggle("over", plan.over);
  if (!fit.hidden) {
    fit.dataset.ids = ids.join(",");
    $("#dayFitText").textContent = plan.over ? "Your workday ended at " + fmtClock(plan.endAt) + ". Done for today?" : plural(ids.length, "task") + " won't fit before " + fmtClock(plan.endAt) + ".";
    $("#dayFitMove").textContent = plan.over ? "Move the rest to tomorrow" : "Move to tomorrow";
  }
  document.querySelectorAll("#taskList .group.section").forEach((h) => {
    const times = [...$("#taskList").querySelectorAll(".task")].filter((li) => groupBefore($("#taskList"), li) === h.dataset.g).map((li) => plan.get(li.dataset.id)).filter((x) => x && x.start);
    h.querySelector(".sec-time").textContent = times.length ? fmtClock(Math.min(...times.map((x) => x.start))) + " – " + fmtClock(Math.max(...times.map((x) => x.end))) : "";
  });
  const day = $("#taskList .day-plan");
  if (day) {
    const late = plan.end > plan.endAt && !plan.over;
    day.querySelector(".net").textContent = fmtDur(plan.focus);
    day.querySelector(".gross").textContent = fmtDur(plan.focus + plan.breaks);
    day.querySelector(".eta").textContent = "~" + fmtClock(plan.end);
    day.querySelector(".eta-stat").classList.toggle("late", late);
    day.title = plural(+day.dataset.tasks, "task") + " · " + plural(+day.dataset.cycles, "cycle") + " to go. Focus is pure work time; with breaks adds " + fmtDur(plan.breaks) + " of short and long breaks from your settings. Done is when you'd finish if you start now" + (late ? ", after your workday ends at " + fmtClock(plan.endAt) : "") + ".";
  }
}
function renderTasks() {
  if (drag) return;
  renderedDay = todayKey();
  const fa = document.activeElement, keepFocus = fa && $("#taskList").contains(fa) && fa.closest(".task") ? {
    id: fa.closest(".task").dataset.id, field: fa.dataset.field || "", subid: fa.matches("[data-subtitle]") ? fa.closest(".subtask").dataset.subid : "",
    add: fa.matches(".subtask-add input"), row: fa.matches(".task"), value: fa.value, start: fa.selectionStart, end: fa.selectionEnd } : null;
  $("#taskList").querySelectorAll(".subtask-add input").forEach((input) => S.subtaskDrafts.set(input.closest(".task").dataset.id, input.value));
  const vt = viewTasks(), pv = preview();
  const projects = projectNames(vt);
  Labels.importTasks(S.tasks);
  if (S.projectFilter.startsWith("project:") && !projects.includes(S.projectFilter.slice(8))) S.projectFilter = "";
  if (!projects.length) S.projectFilter = "";
  const allOpen = openOf(vt), open = allOpen.filter(inProject);
  const openIn = (name) => allOpen.filter((t) => projectOf(t) === name).length, unlabeled = allOpen.filter((t) => !projectOf(t)).length;
  const filterChip = (v, html, n) => '<button type="button" data-filter="' + esc(v) + '" aria-pressed="' + (S.projectFilter === v) + '">' + html + "<em>" + n + "</em></button>";
  $("#projectFilter").hidden = !projects.length;
  $("#projectFilter").innerHTML = filterChip("", "<span>All</span>", allOpen.length) +
    projects.filter((name) => openIn(name) || S.projectFilter === "project:" + name || !labelHidden(name))
      .map((name) => filterChip("project:" + name, labelDot(name) + "<span>" + esc(name) + "</span>", openIn(name))).join("") +
    (unlabeled || S.projectFilter === "none" ? filterChip("none", "<span>No label</span>", unlabeled) : "");
  const selected = [...vt.values()].filter((t) => !t.system && inProject(t));
  const doneN = selected.filter((t) => t.done).length;
  $("#projectSummary").hidden = !S.projectFilter;
  $("#projectSummary").textContent = plural(open.length, "open task") + " · " + plural(doneN, "finished task") + " · " + fmtDur(selected.reduce((sum, t) => sum + timeOf(t), 0)) + " focus logged";
  $("#taskCount").textContent = open.length ? plural(open.length, "open task") + (doneN ? " · " + doneN + " finished" : "") : doneN ? doneN + " finished" : "";
  const tk = todayKey(), byView = { today: [], upcoming: [], later: [] };
  open.forEach((t) => byView[bucketOf(t, tk)].push(t));
  document.querySelectorAll("#taskViews [data-view]").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.view === S.taskView);
    b.querySelector("em").textContent = byView[b.dataset.view].length || "";
  });
  const ul = $("#taskList");
  if (!open.length) {
    ul.innerHTML = "";
    $("#taskFoot").innerHTML = S.projectFilter ? '<div class="empty"><strong>No open tasks with this label</strong><span>Choose “All” to see the rest of your ledger.</span></div>' : '<div class="empty"><strong>No open tasks</strong><span>Add one above and estimate how many 25-minute cycles it needs. Then pick it under “Working on” and press Start.</span></div>';
  } else {
    const row = (t, dated) => {
      const active = t.id === S.activeId, open = S.openTask === t.id, del = S.confirmDel === t.id;
      const subs = subsOf(t), subsDone = subs.filter((x) => x.done).length;
      const dropAge = S.dropped && S.dropped.id === t.id ? Date.now() - S.dropped.at : Infinity;
      const today = isToday(t), name = esc(t.title);
      const meta = 
        (dated && t.plan ? '<span class="when-chip">' + esc(shortDay(t.plan)) + "</span>" : "") +
        (projectOf(t) ? projectHTML(t) : "") +
        (subs.length ? '<span class="' + (subsDone === subs.length ? "done-all" : "") + '">' + ICON.list + subsDone + "/" + subs.length + "</span>" : "") +
        (t.notes ? '<span title="Has notes">' + ICON.note + "</span>" : "") +
        (today && t.plan && t.plan < tk ? '<span class="carry">from ' + esc(fmtDate(keyTime(t.plan), { weekday: "short" })) + "</span>" : "");
      const cls = "task" + (active ? " is-active" : "") + (open ? " open" : "") + (completing.has(t.id) ? " completing" : "") + (dropAge < 900 ? " dropped" : "");
      return '<li class="' + cls + '"' + (dropAge < 900 ? ' style="animation-delay:-' + dropAge + 'ms"' : "") + ' data-id="' + esc(t.id) + '" tabindex="0" aria-expanded="' + open + '" aria-label="' + name + '">' +
        '<button class="grip" type="button" tabindex="-1"' + (S.projectFilter ? " disabled" : "") + ' aria-label="Reorder “' + name + '”: drag, or press the up and down arrow keys" title="' + (S.projectFilter ? "Show all tasks to reorder" : "Drag to reorder") + '">' + ICON.grip + "</button>" +
        '<button class="check" type="button" data-act="done" aria-label="Mark “' + name + '” as finished" title="Mark finished">' + ICON.check + "</button>" +
        '<div class="task-main" data-act="open"><div class="task-title"><span class="tt">' + name + "</span></div>" + '<div class="task-meta">' + meta + "</div></div>" +
        '<div class="task-side"><div class="side-info">' + (today ? '<span class="late-flag" hidden>' + ICON.clock + "</span>" : "") + '<span class="cyc" title="' + cyclesOf(t) + " of " + plural(t.est || 0, "planned cycle") + '">' + pipsHTML(t) + "</span></div>" +
        '<div class="side-acts">' + (today ? '<span class="task-start"></span>' : "") + '<button class="icon-btn" type="button" data-act="sched" data-sched aria-haspopup="dialog" aria-label="When: “' + name + '”" title="When? (D)">' + ICON.cal + "</button>" +
        '<button class="icon-btn play" type="button" data-act="focus" aria-label="Start focusing on “' + name + '”" title="Focus on this">' + ICON.play + "</button></div></div>" +
        (open ? cardHTML(t, del) : "") + "</li>";
    };
    const left = (list) => list.reduce((a, t) => a + Math.max(0, (t.est || 0) - cyclesOf(t)), 0);
    const shown = byView[S.taskView];
    let html = "";
    if (S.taskView === "today" && (shown.length || sections().length)) {
      const n = left(shown);
      html = '<li class="group today-head" data-g="today">' + ICON.star + 'Today<button class="add-sec" type="button" data-addsec title="Add a section, like Morning or Admin">+ Section</button>' +
        (n ? '<div class="day-plan" data-cycles="' + n + '" data-tasks="' + shown.length + '"><span class="stat"><small>Focus</small><strong class="net"></strong></span>' +
          '<span class="stat"><small><span class="lg">With breaks</span><span class="sh">Total</span></small><strong class="gross"></strong></span>' +
          '<span class="stat eta-stat"><small>Done</small><strong class="eta"></strong></span></div>'

          : "<span>" + (shown.length ? plural(shown.length, "task") + " · all planned cycles done" : "Nothing planned yet") + "</span>") + "</li>";
    }
    const summary = (list) => (list.length ? plural(list.length, "task") + (left(list) ? " · " + fmtDur(left(list) * dur("focus")) + " focus" : "") : "");
    if (S.taskView === "upcoming") {
      // The next seven days always show, so any of them can take a dropped task; further out is grouped by month.
      const base = sod(Date.now()), week = [...Array(7)].map((_, i) => dayKey(addDays(base, i + 1)));
      for (const k of week) {
        const same = shown.filter((t) => t.plan === k);
        html += '<li class="group day' + (same.length ? "" : " empty") + '" data-g="' + k + '"><b>' + new Date(keyTime(k)).getDate() + "</b>" + esc(dayName(k)) + "<span>" + summary(same) + "</span></li>";
        same.forEach((t) => { html += row(t); });
      }
      const months = new Map();
      shown.filter((t) => t.plan > week[6]).forEach((t) => { const ym = t.plan.slice(0, 7); months.set(ym, [...(months.get(ym) || []), t]); });
      for (const [ym, list] of months) {
        const [y, m] = ym.split("-").map(Number), firstDay = dayKey(addDays(base, 8)), start = firstDay > ym + "-01" ? firstDay : ym + "-01";
        const end = dayKey(new Date(y, m, 0).getTime()), name = fmtDate(new Date(y, m - 1, 1).getTime(), y === new Date(base).getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
        html += '<li class="group month" data-g="' + start + '" data-end="' + end + '">' + esc((start !== ym + "-01" ? "Rest of " : "") + name) + "<span>" + summary(list) + "</span></li>";
        list.forEach((t) => { html += row(t, true); });
      }
    } else if (S.taskView === "today") {
      const known = new Set(sections().map((x) => x.id));
      shown.filter((t) => !known.has(t.section)).forEach((t) => { html += row(t); });
      for (const sec of sections()) {
        const mine = shown.filter((t) => t.section === sec.id);
        html += '<li class="group section" data-g="sec:' + esc(sec.id) + '"><button class="grip sec-grip" type="button" aria-label="Move section ' + esc(sec.title) + ': drag, or press the up and down arrow keys" title="Drag to reorder">' + ICON.grip + '</button><input class="sec-title" type="text" maxlength="60" value="' + esc(sec.title) + '" aria-label="Section name" data-sec="' + esc(sec.id) + '">' +
          '<span class="sec-time"></span><span class="sec-sum">' + (mine.length ? "" : "Drag tasks here") + "</span>" +
          '<button class="icon-btn sec-del" type="button" data-secdel="' + esc(sec.id) + '" aria-label="Remove section ' + esc(sec.title) + '" title="Remove section (its tasks stay in Today)">' + ICON.x + "</button></li>";
        mine.forEach((t) => { html += row(t); });
      }
    } else shown.forEach((t) => { html += row(t); });
    ul.innerHTML = html;
    const empty = { today: ["Nothing planned for today", "Press D on a task, or use its calendar button, to bring it here."], upcoming: ["", ""], later: ["Nothing in Later", "Tasks without a day land here."] }[S.taskView];
    $("#taskFoot").innerHTML = (shown.length || !empty[0] ? "" : '<div class="empty"><strong>' + empty[0] + "</strong><span>" + empty[1] + "</span></div>") +
      (doneN ? '<div class="finished-note">' + plural(doneN, "finished task") + ' with cycles and time are in the <a href="#ledger">ledger below</a>.</div>' : "");
  }
  if (keepFocus) {
    const li = [...ul.querySelectorAll(".task")].find((x) => x.dataset.id === keepFocus.id);
    const el = !li ? null : keepFocus.row ? li : keepFocus.field ? li.querySelector('[data-field="' + keepFocus.field + '"]') : keepFocus.subid ? li.querySelector('[data-subid="' + keepFocus.subid + '"] [data-subtitle]') : keepFocus.add ? li.querySelector(".subtask-add input") : null;
    if (el) {
      if (keepFocus.field && el.value !== keepFocus.value) el.value = keepFocus.value;
      el.focus({ preventScroll: true });
      try { if (keepFocus.start != null) el.setSelectionRange(keepFocus.start, keepFocus.end); } catch {}
    }
  }
  renderTaskStarts(true);
  if (!labelPop.hidden) {
    const a = labelAnchor();
    if (a) { if (LP.key !== "hash") a.setAttribute("aria-expanded", "true"); placeLabelPop(); } else closeLabelPop();
  }
  // task picker
  const act = S.activeId && vt.get(S.activeId);
  pickOpts = [{ id: "", title: "Unplanned focus (no task)" }].concat(allOpen.map((t) => ({ id: t.id, title: t.title, meta: (projectOf(t) ? projectOf(t) + " · " : "") + cyclesOf(t) + "/" + (t.est || 0) })));
  if (act && act.done) pickOpts.push({ id: act.id, title: act.title + " (finished)" });
  const cur = pickOpts.findIndex((o) => o.id === (act ? act.id : ""));
  $("#pickValue").textContent = pickOpts[Math.max(0, cur)].title;
  pickMenu.innerHTML = pickOpts.map((o, i) => '<li role="option" id="pick-' + i + '" data-i="' + i + '" aria-selected="' + (i === Math.max(0, cur)) + '"><span>' + esc(o.title) + "</span>" + (o.meta ? "<em>" + o.meta + "</em>" : "") + ICON.check + "</li>").join("");
  if (pickOpen) pickMove(Math.min(pickIdx, pickOpts.length - 1));
  $("#workingNote").textContent = act ? cyclesOf(act) + " of " + plural(act.est || 0, "planned cycle") + " done · " + fmtDur(timeOf(act)) + " focus so far" : "Pick a task so its cycles and time are tracked.";
}

// ---------- rendering: stats ----------
function renderStats() {
  const all = viewTasks(), names = progressLabelNames(all), now = Date.now(), today = sod(now);
  if (!names.length || (S.statsFilter.startsWith("project:") && !names.includes(S.statsFilter.slice(8)))) S.statsFilter = "";
  const vt = focusTasks(all, S.statsFilter), days = dayTotals(vt);
  const ledgerTasks = S.statsFilter ? new Map([...all].filter(([, t]) => matchLabel(t, S.statsFilter))) : all;
  const statsChip = (v, html, list) => '<button type="button" data-filter="' + esc(v) + '" aria-pressed="' + (S.statsFilter === v) + '">' + html + "<em>" + fmtDur(list.reduce((a, t) => a + timeOf(t), 0)) + "</em></button>";
  const tasksOf = (f) => [...focusTasks(all, f).values()];
  $("#statsFilter").hidden = !names.length;
  $("#statsFilter").innerHTML = statsChip("", "<span>All</span>", tasksOf("")) +
    names.filter((name) => S.statsFilter === "project:" + name || !labelHidden(name)).map((name) => statsChip("project:" + name, labelDot(name) + "<span>" + esc(name) + "</span>", tasksOf("project:" + name))).join("") +
    statsChip("none", "<span>No label</span>", tasksOf("none"));
  renderByLabel(all, today);
  const tk = days.get(dayKey(now)) || { ms: 0, cycles: 0 };
  const goal = S.settings.goal;
  const sumRange = (from, n) => { let ms = 0; for (let i = 0; i < n; i++) { const o = days.get(dayKey(addDays(from, -i))); if (o) ms += o.ms; } return ms; };
  const wk = sumRange(today, 7), prev = sumRange(addDays(today, -7), 7);
  // streak
  let streak = 0, d = today;
  if (!(days.get(dayKey(d)) || {}).cycles) d = addDays(d, -1);
  while ((days.get(dayKey(d)) || {}).cycles) { streak++; d = addDays(d, -1); }
  let best = 0, run = 0;
  const keys = [...days.keys()].sort();
  if (keys.length) {
    let cur = sod(new Date(keys[0] + "T00:00").getTime());
    while (cur <= today) { if ((days.get(dayKey(cur)) || {}).cycles) { run++; best = Math.max(best, run); } else run = 0; cur = addDays(cur, 1); }
  }
  // estimates
  const fin = [...ledgerTasks.values()].filter((t) => t.done && !t.system && t.est > 0);
  const planned = fin.reduce((a, t) => a + t.est, 0), took = fin.reduce((a, t) => a + cyclesOf(t), 0);
  const ratio = planned ? took / planned : null;
  const diff = ratio == null ? 0 : Math.round((ratio - 1) * 100);
  const delta = wk - prev;
  const tiles = [
    { k: "Focus today", v: fmtDur(tk.ms).replace(/(\d+)([hm])/g, "$1<small>$2</small>"), s: '<div class="meter" role="img" aria-label="' + tk.cycles + " of " + goal + ' cycles"><b style="width:' + Math.min(100, (tk.cycles / goal) * 100) + '%"></b></div><span>' + tk.cycles + " of " + goal + " cycles" + (tk.cycles >= goal ? " · goal reached" : "") + "</span>" },
    { k: "Focus · 7 days", v: fmtDur(wk).replace(/(\d+)([hm])/g, "$1<small>$2</small>"), s: prev || wk ? '<span class="' + (delta >= 0 ? "up" : "down") + '">' + (delta >= 0 ? "+" : "−") + fmtDur(Math.abs(delta)) + "</span> vs the 7 days before" : "No focus logged yet" },
    { k: "Streak", v: streak + "<small>" + (streak === 1 ? "day" : "days") + "</small>", s: streak ? "Best run: " + plural(best, "day") : "Finish a cycle today to start one" },
    { k: "Estimates", v: ratio == null ? "–" : ratio.toFixed(2) + "<small>×</small>", s: ratio == null ? "Finish a task to compare plan and reality" : (Math.abs(diff) < 5 ? "Finished tasks land close to plan" : "Tasks take " + Math.abs(diff) + "% " + (diff > 0 ? "more" : "fewer") + " cycles than planned") + " · " + plural(fin.length, "task") },
  ];
  $("#tiles").innerHTML = tiles.map((t) => '<div class="tile"><div class="k">' + t.k + '</div><div class="v">' + t.v + '</div><div class="s">' + t.s + "</div></div>").join("");
  const split = S.statsFilter ? new Map() : dayLabels(vt);
  renderBars(days, today, split);
  renderHeat(days, today, split);
  renderSessions(all, S.statsFilter);
  renderLedger(ledgerTasks);
}

function renderByLabel(tasks, today) {
  const card = $("#byLabel");
  card.hidden = !progressLabelNames(tasks).length;
  if (card.hidden) return;
  $("#byRange").innerHTML = [["7", "7 days"], ["30", "30 days"], ["all", "All time"]].map(([v, l]) => '<button type="button" data-range="' + v + '" aria-pressed="' + (S.byRange === v) + '"><span>' + l + "</span></button>").join("");
  const since = S.byRange === "all" ? 0 : addDays(today, 1 - S.byRange), by = new Map();
  for (const t of tasks.values()) {
    const name = projectOf(t), r = by.get(name) || { name, ms: 0, cycles: 0, done: 0, open: 0 };
    by.set(name, r);
    for (const s of t.sessions || []) if (s.at >= since) {
      const label = sessionProject(t, s), row = by.get(label) || { name: label, ms: 0, cycles: 0, done: 0, open: 0 };
      by.set(label, row); row.ms += s.ms || 0; if (s.full) row.cycles++;
    }
    if (t.system) continue;
    if (!t.done) r.open++; else if ((t.doneAt || 0) >= since) r.done++;
  }
  const rows = [...by.values()].filter((r) => r.ms || r.done).sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
  const total = rows.reduce((a, r) => a + r.ms, 0), max = Math.max(1, ...rows.map((r) => r.ms)), tb = $("#byLabelTable");
  $("#byLabelSub").textContent = rows.length ? fmtDur(total) + " of focus " + (S.byRange === "all" ? "in total" : "in the last " + S.byRange + " days") + ". “No label” includes unplanned focus." : "No focus logged in this period.";
  if (!rows.length) { tb.innerHTML = ""; return; }
  tb.innerHTML = '<thead><tr><th>Label</th><th>Share of focus</th><th class="num">Focus time</th><th class="num">Share</th><th class="num">Cycles</th><th class="num">Finished</th><th class="num">Open</th></tr></thead><tbody>' + rows.map((r) => {
    const share = total ? Math.round((r.ms / total) * 100) + "%" : "–", name = r.name || "No label";
    const tip = "<b>" + esc(name) + "</b><br>" + fmtDur(r.ms) + " · " + plural(r.cycles, "cycle") + " · " + share + " of focus";
    return '<tr data-tip="' + esc(tip) + '"><td class="t"><span class="by-name' + (r.name ? "" : " none") + '">' + (r.name ? labelDot(r.name) : '<i class="label-dot none"></i>') + "<span>" + esc(name) + '</span></span></td><td class="barcell"><div class="hbar">' + (r.ms ? '<b style="width:' + (r.ms / max) * 100 + '%"></b>' : "") + '</div></td><td class="num">' + fmtDur(r.ms) + '</td><td class="num">' + share + '</td><td class="num">' + r.cycles + '</td><td class="num">' + r.done + '</td><td class="num">' + r.open + "</td></tr>";
  }).join("") + "</tbody>";
  labelTable(tb);
}

function barPath(x, y, w, h, r) {
  if (h <= 0.5) return "";
  r = Math.min(r, h, w / 2);
  return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
}
function dayLabels(tasks) {
  const m = new Map();
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const k = dayKey(s.at), o = m.get(k) || new Map();
    const name = sessionProject(t, s);
    o.set(name, (o.get(name) || 0) + (s.ms || 0)); m.set(k, o);
  }
  return m;
}
function labelTip(o) {
  if (!o || ![...o.keys()].some(Boolean)) return "";
  const rows = [...o].sort((a, b) => b[1] - a[1]);
  return rows.slice(0, 4).map(([name, ms]) => "<br>" + esc(name || "No label") + " " + fmtDur(ms)).join("") + (rows.length > 4 ? "<br>+" + (rows.length - 4) + " more" : "");
}
function renderBars(days, today, split) {
  const W = Math.max(300, Math.min(760, $("#bars").clientWidth || 560)), H = 210, ml = 34, mr = 8, mt = 18, mb = 26, n = 14;
  const pw = W - ml - mr, ph = H - mt - mb, band = pw / n, bw = Math.min(26, band * 0.62);
  const data = [];
  for (let i = n - 1; i >= 0; i--) { const t = addDays(today, -i); const o = days.get(dayKey(t)) || { ms: 0, cycles: 0 }; data.push({ t, min: o.ms / MIN, cycles: o.cycles }); }
  const goalMin = S.settings.goal * S.settings.focus;
  const maxV = Math.max(goalMin, ...data.map((d) => d.min), 60);
  const steps = [15, 30, 60, 90, 120, 180, 240, 360];
  const step = steps.find((s) => maxV / s <= 4) || 480;
  const top = Math.ceil(maxV / step) * step;
  const y = (v) => mt + ph - (v / top) * ph;
  let g = "";
  for (let v = 0; v <= top; v += step) {
    g += '<line class="' + (v === 0 ? "base" : "grid") + '" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    g += '<text x="' + (ml - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v >= 60 && v % 60 === 0 ? v / 60 + "h" : v) + "</text>";
  }
  data.forEach((d, i) => {
    const x = ml + i * band + (band - bw) / 2, isT = i === n - 1;
    const tip = "<b>" + fmtDate(d.t, { weekday: "short", day: "numeric", month: "short" }) + "</b><br>" + (d.min ? fmtDur(d.min * MIN) + " · " + plural(d.cycles, "cycle") + labelTip(split.get(dayKey(d.t))) : "No focus");
    g += '<rect class="hit" data-tip="' + esc(tip) + '" x="' + (ml + i * band) + '" y="' + mt + '" width="' + band + '" height="' + ph + '" fill="transparent"/>';
    g += '<path class="bar' + (isT ? " today" : "") + '" data-i="' + i + '" d="' + barPath(x, y(d.min), bw, y(0) - y(d.min), 4) + '"/>';
    const lab = new Date(d.t).getDate();
    g += '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle"' + (isT ? ' class="val"' : "") + ">" + lab + "</text>";
    if (isT && d.min) g += '<text class="val" x="' + (x + bw / 2) + '" y="' + (y(d.min) - 6) + '" text-anchor="middle">' + fmtDur(d.min * MIN) + "</text>";
  });
  g += '<line class="goal" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(goalMin) + '" y2="' + y(goalMin) + '"/>';
  g += '<text class="goal-l" x="' + ml + '" y="' + (y(goalMin) - 5) + '">goal ' + fmtDur(goalMin * MIN) + "</text>";
  $("#bars").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Focus minutes per day for the last 14 days">' + g + "</svg>";
}
function renderHeat(days, today, split) {
  const weeks = 20, cs = 13, gap = 3, ml = 30, mt = 18;
  const dow = (new Date(today).getDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -dow - (weeks - 1) * 7);
  const W = ml + weeks * (cs + gap), H = mt + 7 * (cs + gap);
  let g = "", lastM = -1;
  for (let c = 0; c < weeks; c++) {
    const colStart = addDays(start, c * 7), m = new Date(colStart).getMonth();
    if (m !== lastM) { if (c < weeks - 1) g += '<text x="' + (ml + c * (cs + gap)) + '" y="11">' + fmtDate(colStart, { month: "short" }) + "</text>"; lastM = m; }
    for (let r = 0; r < 7; r++) {
      const t = addDays(start, c * 7 + r);
      if (t > today) continue;
      const o = days.get(dayKey(t)) || { ms: 0, cycles: 0 }, min = o.ms / MIN;
      const lv = min === 0 ? 0 : min < 30 ? 1 : min < 75 ? 2 : min < 150 ? 3 : 4;
      const tip = "<b>" + fmtDate(t, { weekday: "short", day: "numeric", month: "short" }) + "</b><br>" + (min ? fmtDur(o.ms) + " · " + plural(o.cycles, "cycle") + labelTip(split.get(dayKey(t))) : "No focus");
      g += '<rect class="cell l' + lv + (t === today ? " today" : "") + '" data-tip="' + esc(tip) + '" x="' + (ml + c * (cs + gap)) + '" y="' + (mt + r * (cs + gap)) + '" width="' + cs + '" height="' + cs + '" rx="3"/>';
    }
  }
  ["Mon", "", "Wed", "", "Fri", "", ""].forEach((l, r) => { if (l) g += '<text x="0" y="' + (mt + r * (cs + gap) + 10) + '">' + l + "</text>"; });
  $("#heat").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Focus calendar for the last 20 weeks">' + g + "</svg>";
}
function renderLedger(vt) {
  const fin = [...vt.values()].filter((t) => t.done && !t.system).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const tb = $("#doneTable");
  if (!fin.length) {
    tb.innerHTML = "";
    $("#doneFoot").innerHTML = '<div class="empty"><strong>Nothing finished yet</strong><span>Tick a task when it’s done. It moves here with its planned cycles, actual cycles and total focus time.</span></div>';
    return;
  }
  const rows = (S.showAll ? fin : fin.slice(0, 8)).map((t) => {
    const c = cyclesOf(t), d = c - (t.est || 0);
    const badge = !t.est ? "" : d > 0 ? '<span class="delta over">+' + d + "</span>" : d === 0 ? '<span class="delta on">on plan</span>' : '<span class="delta on">' + d + "</span>";
    const first = (t.sessions || []).reduce((a, s) => Math.min(a, s.at), t.doneAt || Date.now());
    const span = Math.max(1, Math.round((sod(t.doneAt || Date.now()) - sod(first)) / 86400000) + 1);
    return "<tr><td class=\"t\">" + esc(t.title) + " " + projectHTML(t) + subtasksHTML(t, true) + (t.sample ? ' <span class="chip">Example</span>' : "") + '</td><td class="num">' + (t.est || "–") + '</td><td class="num">' + c + badge + '</td><td class="num">' + fmtDur(timeOf(t)) + '</td><td class="mono">' + (t.doneAt ? fmtDate(t.doneAt) : "–") + '</td><td class="mono">' + plural(span, "day") + '</td><td class="num"><button class="icon-btn" type="button" data-reopen="' + esc(t.id) + '" aria-label="Move “' + esc(t.title) + '” back to open tasks" title="Reopen">' + ICON.undo + "</button></td></tr>";
  }).join("");
  tb.innerHTML = '<thead><tr><th>Task</th><th class="num">Planned</th><th class="num">Took</th><th class="num">Focus time</th><th>Finished</th><th>Span</th><th class="num"><span hidden>Actions</span></th></tr></thead><tbody>' + rows + "</tbody>";
  labelTable(tb);
  $("#doneFoot").innerHTML = fin.length > 8 ? '<button class="link" type="button" id="toggleAll">' + (S.showAll ? "Show recent only" : "Show all " + fin.length + " finished tasks") + "</button>" : "";
}

function labelTable(table) {
  const labels = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
  table.querySelectorAll("tbody tr").forEach((row) => {
    [...row.cells].forEach((cell, i) => { cell.dataset.label = labels[i]; });
  });
}
function renderPill() {
  const p = $("#syncPill");
  const offline = S.storeMode === "db" && Cloud.state === "offline";
  const st = preview() ? "preview" : offline ? "offline" : S.storeMode;
  p.dataset.state = st;
  p.querySelector("span").textContent = DEMO ? "Demo mode" : st === "preview" ? "Example data" : offline ? "Offline · will sync" : st === "db" ? "Synced to your account" : Cloud.state === "signedout" ? "Saved in this browser · Sign in to sync" : "Saved in this browser";
  $("#previewBanner").hidden = !preview();
  $("#previewBanner span").innerHTML = DEMO
    ? "<strong>Interactive demo.</strong> Changes reset when you reload and never affect your saved ledger."
    : "<strong>You're looking at example data.</strong> Add your first task or start the timer, and the examples disappear.";
  $("#startOwn").textContent = DEMO ? "Exit demo" : "Start my own ledger";
}
// Labels for what the title parser recognised, in the words the composer shows.
function parseNew(raw) {
  const parsed = parseTitle(raw, S.newKeep);
  return { ...parsed, tokens: parsed.tokens.map((x) => ({ text: x.text, label: x.kind === "est" ? plural(x.est, "cycle") : x.when === "later" ? "Later" : dayName(x.when === "today" ? todayKey() : x.when) })) };
}
const newDefaultWhen = () => (S.taskView === "upcoming" ? dayKey(addDays(Date.now(), 1)) : S.taskView);
// Looked up rather than closed over: this runs during startup, before the composer's other bindings exist.
function newWhenNow(parsed = parseNew($("#newTitle").value)) { return parsed.when || S.newWhen || newDefaultWhen(); }
function renderEstPick() {
  const parsed = parseNew($("#newTitle").value), est = parsed.est || S.newEst, when = newWhenNow(parsed);
  let breaks = 0;
  for (let i = 1; i < est; i++) breaks += dur(i % S.settings.longEvery ? "short" : "long");
  const out = $("#estOut");
  out.textContent = plural(est, "cycle");
  out.title = fmtDur(est * dur("focus")) + " focus" + (breaks ? " + " + fmtDur(breaks) + " breaks" : "");
  out.parentElement.classList.toggle("auto", !!parsed.est);
  $("#newEst .est-pick").outerHTML = estCircles(est, "data-nset");
  const w = $("#newWhen");
  w.innerHTML = when === "today" ? ICON.star + "Today" : when === "later" ? ICON.cal + "Later" : ICON.cal + esc(dayName(when));
  w.classList.toggle("auto", !!parsed.when);
  const hint = $("#newParsed");
  hint.hidden = !parsed.tokens.length;
  hint.innerHTML = parsed.tokens.map((x) => "<mark>" + esc(x.text) + "</mark> → " + esc(x.label)).join(" · ") + (parsed.tokens.length ? ' <button type="button" id="newKeep">Keep as text</button>' : "");
}
function renderAll() { renderPill(); renderTasks(); renderStats(); renderEstPick(); renderTimer(true); }

// ---------- toast & tooltip ----------
let toastT = null;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3600); }
const tip = $("#tip");
let hoverBar = null;
function hideTip() {
  tip.hidden = true;
  if (hoverBar) { hoverBar.classList.remove("hover"); hoverBar = null; }
}
function showTip(e) {
  const el = e.target.closest && e.target.closest("[data-tip]");
  hideTip();
  if (!el) return;
  if (el.classList.contains("hit")) { const b = el.nextElementSibling; if (b) { b.classList.add("hover"); hoverBar = b; } }
  tip.innerHTML = el.dataset.tip; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - h - 12;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (x < 8) x = 8;
  if (y < 8) y = e.clientY + 16;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
// A finger that starts scrolling fires pointermove but never pointerleave, which left tips stranded; touch shows them on tap.
let tipPointer = "mouse";
document.addEventListener("pointerdown", (e) => { tipPointer = e.pointerType; }, true);
document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") showTip(e); });
document.addEventListener("click", (e) => { if (tipPointer !== "mouse") showTip(e); });
document.addEventListener("pointerleave", hideTip);
document.addEventListener("scroll", hideTip, true);

// ---------- events ----------
const guardPreview = () => { if (preview() && !DEMO) { toast("These are examples. Add a task to start your own ledger."); return true; } return false; };
$("#startBtn").addEventListener("click", () => { buzz(T.status === "running" ? 8 : 14); toggle(); });
$("#resetBtn").addEventListener("click", () => { buzz(8); flushPartial(); setMode(T.mode); });
$("#skipBtn").addEventListener("click", () => { buzz(8); skip(); });
$("#adjust").addEventListener("click", (e) => { const b = e.target.closest("[data-adj]"); if (b) adjust(+b.dataset.adj); });
document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.mode !== T.mode) setMode(b.dataset.mode, true); }));
$("#fullBtn").addEventListener("click", (e) => toggleZen(e.shiftKey));
pickBtn.addEventListener("click", () => (pickOpen ? closePick() : openPick()));
pickBtn.addEventListener("keydown", (e) => {
  const k = e.key, last = pickOpts.length - 1;
  if (!pickOpen) { if (k === "ArrowDown" || k === "ArrowUp" || k === " ") { e.preventDefault(); openPick(); } return; }
  e.stopPropagation();
  if (k === "Tab") { closePick(); return; }
  if (k === "Escape") closePick();
  else if (k === "ArrowDown") pickMove(Math.min(last, pickIdx + 1));
  else if (k === "ArrowUp") pickMove(Math.max(0, pickIdx - 1));
  else if (k === "Home") pickMove(0);
  else if (k === "End") pickMove(last);
  else if (k === "Enter" || k === " ") pickChoose(pickIdx);
  else return;
  e.preventDefault();
});
pickBtn.addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); });
pickMenu.addEventListener("mousedown", (e) => e.preventDefault());
pickMenu.addEventListener("pointermove", (e) => { const li = e.target.closest("li"); if (li && +li.dataset.i !== pickIdx) pickMove(+li.dataset.i); });
pickMenu.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) pickChoose(+li.dataset.i); });
document.addEventListener("pointerdown", (e) => { if (pickOpen && !e.target.closest("#pick")) closePick(); });
$("#startOwn").addEventListener("click", () => {
  if (DEMO) {
    const url = new URL(location.href);
    url.searchParams.delete("demo");
    location.assign(url.pathname + url.search + url.hash);
    return;
  }
  markStarted(); $("#newTitle").focus();
});
function pickNewEst(n) {
  const parsed = parseNew($("#newTitle").value);
  if (parsed.est) dropToken(parsed.tokens.at(-1).text);
  S.newEst = n;
  renderEstPick();
}
// Changing a chip by hand takes over from what was typed, so the typed words come out of the title.
function dropToken(text) {
  const v = newTitle.value, i = v.toLowerCase().lastIndexOf(text.toLowerCase());
  if (i < 0) return;
  newTitle.value = (v.slice(0, i) + v.slice(i + text.length)).replace(/\s+$/, "") + " ";
}
$("#addForm").addEventListener("click", (e) => {
  const pick = e.target.closest("[data-nset]");
  if (pick) { if (e.detail === 0) pickNewEst(+pick.dataset.nset); return; }
  if (e.target.id === "newKeep") {
    S.newKeep.push(...parseNew(newTitle.value).tokens.map((x) => x.text.toLowerCase()));
    renderEstPick(); newTitle.focus(); return;
  }
  if (e.target.closest("#newWhen")) {
    const parsed = parseNew(newTitle.value), when = newWhenNow(parsed);
    openWhen($("#newWhen"), { plan: when !== "today" && when !== "later" ? when : undefined }, (g) => {
      const p = parseNew(newTitle.value);
      if (p.when) dropToken(p.tokens[0].text);
      S.newWhen = g; renderEstPick(); newTitle.focus();
    });
  }
});
$("#newTitle").addEventListener("input", renderEstPick);
const newTaskForm = $("#addForm"), newTaskOptions = $("#newTaskOptions"), newTitle = $("#newTitle"), newLabel = $("#newLabel");
const filterLabel = () => (S.projectFilter.startsWith("project:") ? S.projectFilter.slice(8) : "");
function renderNewLabel() {
  newLabel.classList.toggle("set", !!S.newLabel);
  newLabel.innerHTML = labelChipInner(S.newLabel);
  newLabel.setAttribute("aria-label", labelChipName(S.newLabel));
}
renderNewLabel();
function collapseNewTask() {
  if (LP.key === "new" || LP.key === "hash") closeLabelPop();
  if (newTaskForm.contains(document.activeElement)) document.activeElement.blur();
  newTaskOptions.hidden = true; newTaskForm.classList.remove("open");
  if (!newTitle.value.trim()) { S.newLabel = filterLabel(); renderNewLabel(); S.newWhen = null; S.newKeep = []; $("#newNotes").value = ""; renderEstPick(); }
}
newTaskForm.addEventListener("focusin", () => { newTaskOptions.hidden = false; newTaskForm.classList.add("open"); renderEstPick(); });
// on click, not pointerdown: collapsing shifts the list, and the click would land on a different row
document.addEventListener("click", (e) => {
  if (newTaskOptions.hidden || !e.target.isConnected || e.target.closest("#openRoom, #openSettings, #labelPop, #whenPop")) return;
  if (!newTaskForm.contains(e.target) && !newTitle.value.trim()) collapseNewTask();
});
newLabel.addEventListener("click", () => {
  openLabelPop("new", () => newLabel, S.newLabel, (name) => { S.newLabel = name; renderNewLabel(); newTitle.focus(); });
});
let hashOff = -1;
function hashToken() {
  const v = newTitle.value, caret = newTitle.selectionStart, at = v.lastIndexOf("#", caret - 1);
  if (caret !== newTitle.selectionEnd || at < 0 || (at > 0 && !/\s/.test(v[at - 1]))) return null;
  return { at, query: v.slice(at + 1, caret) };
}
const hashOpen = () => !labelPop.hidden && LP.key === "hash";
newTitle.addEventListener("input", () => {
  const tok = hashToken(), q = tok ? tok.query : "";
  if (!tok) hashOff = -1;
  if (!tok || tok.at === hashOff || /^\s/.test(q) || (/\s/.test(q) && !labelMatches(q.trim()).length)) { if (hashOpen()) closeLabelPop(); return; }
  if (!hashOpen()) {
    openLabelPop("hash", () => newTitle, S.newLabel, (name) => {
      const t = hashToken();
      if (t) {
        const v = newTitle.value, head = v.slice(0, t.at);
        newTitle.value = head + v.slice(newTitle.selectionStart).trimStart();
        newTitle.setSelectionRange(head.length, head.length);
      }
      S.newLabel = name; renderNewLabel();
    });
  }
  LP.query = q; renderLabelPop();
  if (!LP.opts.length) closeLabelPop();
});
newTitle.addEventListener("keydown", (e) => {
  if (!hashOpen()) return;
  if (e.key === "Tab") { closeLabelPop(); return; }
  if (e.key === "Escape") { const tok = hashToken(); hashOff = tok ? tok.at : -1; }
  labelKey(e);
});
newTitle.addEventListener("blur", () => { if (hashOpen() && document.hasFocus()) closeLabelPop(); });
newTaskForm.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.stopPropagation(); collapseNewTask(); }
  else if (e.key === "Enter" && e.target.id === "newNotes" && !e.shiftKey) { e.preventDefault(); newTaskForm.requestSubmit(); }
});
newTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (hashOpen()) closeLabelPop();
  const parsed = parseNew(newTitle.value), title = parsed.title.slice(0, 140);
  if (!title) { newTitle.focus(); return; }
  markStarted(true);
  const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const into = newWhenNow(parsed), notes = $("#newNotes").value.trim();
  const last = Math.max(-1, ...openOf(S.tasks).filter((x) => inGroup(x, into)).map(ord));
  const t = placed({ id, title, est: parsed.est || S.newEst, done: false, createdAt: Date.now(), doneAt: null, sessions: [], subtasks: [], ...(notes ? { notes } : {}) }, into, last + 1);
  if (S.newLabel) t.project = Labels.use(S.newLabel);
  if (!S.activeId || !S.tasks.get(S.activeId) || S.tasks.get(S.activeId).done) { S.activeId = id; saveTimer(); }
  newTitle.value = ""; $("#newNotes").value = ""; S.newWhen = null; S.newKeep = [];
  if (!inProject(t)) S.projectFilter = "";
  Store.saveTask(t);
  newTitle.focus();
  toast("Added “" + title + "”" + (t.project ? " to " + t.project : "") + " · " + (into === "later" ? "Later" : dayName(into === "today" ? todayKey() : into)) + ".");
});
function focusSubtask(id, subid, selector = "[data-subdone]") {
  const row = [...$("#taskList").querySelectorAll(".task")].find((el) => el.dataset.id === id);
  if (!row) return;
  const sub = [...row.querySelectorAll(".subtask")].find((el) => el.dataset.subid === subid);
  (sub ? sub.querySelector(selector) : row.querySelector(".subtask-add input"))?.focus();
}
$("#taskList").addEventListener("submit", (e) => {
  const form = e.target.closest(".subtask-add");
  if (!form) return;
  e.preventDefault();
  if (guardPreview()) return;
  const input = form.querySelector("input"), title = input.value.trim(), id = form.closest(".task").dataset.id;
  if (!title) { input.focus(); return; }
  addSubtasks(id, [title]);
});
function addSubtasks(id, titles) {
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t);
  n.subtasks = [...(n.subtasks || []), ...titles.map((title) => ({ id: crypto.randomUUID(), title: title.slice(0, 140), done: false }))];
  S.subtaskDrafts.delete(id);
  const input = [...$("#taskList").querySelectorAll(".task")].find((el) => el.dataset.id === id)?.querySelector(".subtask-add input");
  if (input) input.value = "";
  Store.saveTask(n);
  focusSubtask(id);
}
$("#taskList").addEventListener("paste", (e) => {
  if (!e.target.closest(".subtask-add")) return;
  const lines = (e.clipboardData ? e.clipboardData.getData("text") : "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, "").trim()).filter(Boolean);
  if (lines.length < 2) return;
  e.preventDefault();
  if (guardPreview()) return;
  addSubtasks(e.target.closest(".task").dataset.id, lines.slice(0, 50));
});
$("#taskList").addEventListener("change", (e) => {
  const input = e.target;
  if (!input.matches("[data-subdone], [data-subtitle]")) return;
  if (guardPreview()) return;
  const id = input.closest(".task").dataset.id, subid = input.closest(".subtask").dataset.subid, t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t), sub = (n.subtasks || []).find((s) => s.id === subid);
  if (!sub) return;
  if (input.matches("[data-subdone]")) sub.done = input.checked;
  else {
    const title = input.value.trim();
    if (!title) { input.value = sub.title; return; }
    sub.title = title;
  }
  const checkbox = input.matches("[data-subdone]");
  Store.saveTask(n, checkbox);
  if (checkbox) focusSubtask(id, subid);
  else {
    const row = input.closest(".subtask");
    row.querySelector("[data-subdone]").setAttribute("aria-label", "Complete subtask: " + sub.title);
    row.querySelector("[data-act='subdelete']").setAttribute("aria-label", "Delete subtask: " + sub.title);
  }
});
$("#projectFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  S.projectFilter = b.dataset.filter;
  if (!newTitle.value.trim()) { S.newLabel = filterLabel(); renderNewLabel(); }
  renderTasks();
  $('#projectFilter [aria-pressed="true"]')?.focus();
});
let delTimer = null;
function saveSections(list) { S.settings.sections = list; Store.saveSettings(); renderTasks(); }

// Sections move as a block: the heading floats with the pointer, a line marks where it lands, and its tasks follow on drop.
let secDrag = null, secPending = null;
function sectionBlocks() {
  const blocks = [];
  let cur = null;
  for (const el of $("#taskList").children) {
    if (el.classList.contains("section")) { cur = { id: el.dataset.g.slice(4), els: [el] }; blocks.push(cur); }
    else if (el.classList.contains("group")) cur = null;
    else if (cur) cur.els.push(el);
  }
  return blocks;
}
function moveSection(id, to) {
  const list = sections(), from = list.findIndex((x) => x.id === id);
  if (from < 0 || to < 0 || to >= list.length || to === from) return false;
  const next = [...list]; next.splice(to, 0, next.splice(from, 1)[0]);
  saveSections(next);
  return true;
}
function startSecDrag(e, head) {
  if (guardPreview()) return;
  const blocks = sectionBlocks(), from = blocks.findIndex((b) => b.els[0] === head);
  if (from < 0 || blocks.length < 2) return;
  const r = head.getBoundingClientRect(), n = blocks[from].els.length - 1;
  const ghost = Object.assign(document.createElement("div"), { className: "sec-ghost", textContent: head.querySelector(".sec-title").value + (n ? "  ·  " + plural(n, "task") : "") });
  Object.assign(ghost.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" });
  const line = Object.assign(document.createElement("div"), { className: "sec-drop" });
  document.body.append(ghost, line);
  blocks[from].els.forEach((el) => el.classList.add("sec-lifted"));
  document.body.classList.add("sec-sorting");
  secDrag = { blocks, from, to: from, ghost, line, offset: e.clientY - r.top };
  moveSecDrag(e.clientY);
}
function moveSecDrag(y) {
  const d = secDrag, others = d.blocks.filter((_, i) => i !== d.from);
  d.ghost.style.top = y - d.offset + "px";
  let to = others.findIndex((b) => y < (b.els[0].getBoundingClientRect().top + b.els.at(-1).getBoundingClientRect().bottom) / 2);
  if (to < 0) to = others.length;
  d.to = to;
  const list = $("#taskList").getBoundingClientRect();
  const at = others[to] ? others[to].els[0].getBoundingClientRect().top - 2 : others.at(-1).els.at(-1).getBoundingClientRect().bottom + 2;
  Object.assign(d.line.style, { left: list.left + "px", width: list.width + "px", top: at + "px" });
}
function endSecDrag(cancel) {
  const d = secDrag;
  if (!d) return;
  secDrag = null;
  d.ghost.remove(); d.line.remove();
  d.blocks[d.from].els.forEach((el) => el.classList.remove("sec-lifted"));
  document.body.classList.remove("sec-sorting");
  if (!cancel) moveSection(d.blocks[d.from].id, d.to);
}
$("#taskList").addEventListener("pointerdown", (e) => {
  if (e.button > 0 || secDrag || drag) return;
  const grip = e.target.closest(".sec-grip"), head = e.target.closest(".group.section");
  if (grip) { e.preventDefault(); startSecDrag(e, head); return; }
  if (head && e.pointerType === "mouse" && !e.target.closest("input, button")) secPending = { x: e.clientX, y: e.clientY, head };
});
document.addEventListener("pointermove", (e) => {
  if (secDrag) { moveSecDrag(e.clientY); return; }
  if (secPending && Math.hypot(e.clientX - secPending.x, e.clientY - secPending.y) > 5) { const h = secPending.head; secPending = null; startSecDrag(e, h); }
});
document.addEventListener("pointerup", () => { secPending = null; endSecDrag(false); });
document.addEventListener("pointercancel", () => { secPending = null; endSecDrag(true); });
document.addEventListener("keydown", (e) => { if (secDrag && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endSecDrag(true); } }, true);
function renameSection(input) {
  const list = sections(), sec = list.find((x) => x.id === input.dataset.sec), title = input.value.trim();
  if (!sec) return;
  if (!title) { input.value = sec.title; return; }
  if (title !== sec.title) saveSections(list.map((x) => (x === sec ? { ...x, title } : x)));
}
$("#taskList").addEventListener("change", (e) => { if (e.target.matches(".sec-title")) renameSection(e.target); });
$("#taskList").addEventListener("click", (e) => {
  if (dragJustEnded) { dragJustEnded = false; return; }
  if (e.target.closest("[data-addsec]")) {
    if (guardPreview()) return;
    const id = "s" + Date.now().toString(36);
    saveSections([...sections(), { id, title: "New section" }]);
    const input = $('#taskList [data-sec="' + id + '"]');
    if (input) { input.focus(); input.select(); }
    return;
  }
  const del = e.target.closest("[data-secdel]");
  if (del) {
    if (guardPreview()) return;
    const sec = sections().find((x) => x.id === del.dataset.secdel);
    saveSections(sections().filter((x) => x !== sec));
    if (sec) toast("Removed “" + sec.title + "”. Its tasks stay in Today.");
    return;
  }
  const b = e.target.closest("[data-act],[data-cest]"); if (!b) return;
  const li = b.closest(".task"); const id = li && li.dataset.id;
  const act = b.dataset.act;
  if (act === "open") { toggleCard(id); return; }
  if (guardPreview()) return;
  const t = S.tasks.get(id); if (!t) return;
  if (b.dataset.cest) {
    // Pointer picks happen on pointerup (below); this path is for Enter/Space.
    if (e.detail === 0) { const n = clone(t); n.est = +b.dataset.cest; Store.saveTask(n); }
    return;
  }
  if (act === "subtasks") {
    toggleCard(id);    } else if (act === "subdelete") {
    const subid = b.closest(".subtask").dataset.subid, n = clone(t);
    n.subtasks = (n.subtasks || []).filter((s) => s.id !== subid);
    Store.saveTask(n);
    focusSubtask(id);
  } else if (act === "label") {
    const find = () => [...$("#taskList").querySelectorAll(".task")].find((el) => el.dataset.id === id)?.querySelector("[data-act='label']");
    openLabelPop("row:" + id, find, projectOf(t), (name) => {
      const cur = S.tasks.get(id);
      if (!cur || name === projectOf(cur)) return;
      const n = clone(cur);
      if (name) n.project = Labels.use(name); else delete n.project;
      Store.saveTask(n);
      find()?.focus();
    });
  } else if (act === "select" || act === "focus") {
    S.activeId = id; saveTimer(); renderTasks();
    if (act === "focus") { if (T.mode !== "focus") setMode("focus", true); if (T.status !== "running") start(); if (phone()) showPage("timer"); }
  } else if (act === "done") {
    // A short pause before the task leaves, so a slipped click can be taken back.
    if (completing.has(id)) { clearTimeout(completing.get(id)); completing.delete(id); li.classList.remove("completing"); return; }
    li.classList.add("completing"); playSound("task");
    completing.set(id, setTimeout(() => {
      completing.delete(id);
      const cur = S.tasks.get(id); if (!cur || cur.done) return;
      if (S.openTask === id) S.openTask = null;
      leaveRows([id], () => {
        const n = clone(cur); n.done = true; n.doneAt = Date.now();
        if (S.activeId === id) { S.activeId = openOf(S.tasks).find((task) => task.id !== id)?.id || null; saveTimer(); }
        Store.saveTask(n);
        toast("Finished “" + cur.title + "” in " + plural(cyclesOf(cur), "cycle") + " · " + fmtDur(timeOf(cur)) + " of focus.");
      });
    }, 900));
  } else if (act === "sched") {
    if (!whenPop.hidden) { closeWhen(); return; }
    openWhen(e.target.closest("[data-sched]"), t);
  } else if (act === "del") {
    if (S.confirmDel === id) { S.confirmDel = null; if (S.openTask === id) S.openTask = null; if (S.activeId === id) { S.activeId = null; saveTimer(); } Store.deleteTask(id); toast("Deleted “" + t.title + "”."); }
    else { S.confirmDel = id; renderTasks(); clearTimeout(delTimer); delTimer = setTimeout(() => { S.confirmDel = null; renderTasks(); }, 3000); }
  }
});
function focusRow(li) {
  if (!li) return;
  if (phone() && document.body.dataset.page !== "tasks") showPage("tasks");
  li.focus({ preventScroll: true });
  li.scrollIntoView({ block: "nearest" });
}
// A sync update can redraw the list between press and release, and the browser then drops the click.
// Reading the circle under the pointer on release still finds the redrawn one in the same place.
let circleDown = null;
document.addEventListener("pointerdown", (e) => {
  const c = e.target.closest && e.target.closest("[data-cest], [data-nset]");
  circleDown = c && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
}, true);
document.addEventListener("pointerup", (e) => {
  const down = circleDown; circleDown = null;
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
  const c = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-cest], [data-nset]");
  if (!c) return;
  if (c.dataset.nset) { pickNewEst(+c.dataset.nset); return; }
  const t = S.tasks.get(c.closest(".task")?.dataset.id);
  if (!t || guardPreview() || (t.est || 0) === +c.dataset.cest) return;
  const n = clone(t); n.est = +c.dataset.cest; Store.saveTask(n);
}, true);
function toggleCard(id, focusTitle) {
  S.openTask = S.openTask === id ? null : id;
  S.confirmDel = null;
  renderTasks();
  const li = [...$("#taskList").querySelectorAll(".task")].find((x) => x.dataset.id === id);
  if (!li) return;
  if (S.openTask && focusTitle) li.querySelector(".card-title")?.focus();
  else if (!S.openTask) li.focus({ preventScroll: true });
}
function saveField(input) {
  const id = input.closest(".task")?.dataset.id, t = id && S.tasks.get(id);
  if (!t || guardPreview()) return;
  const field = input.dataset.field, value = field === "title" ? input.value.trim() : input.value.replace(/\s+$/, "");
  if (field === "title" && !value) { input.value = t.title; return; }
  if ((t[field] || "") === value) return;
  const n = clone(t);
  if (value) n[field] = value; else delete n[field];
  Store.saveTask(n, false);
  if (field === "title") renderTasks();
}
let notesTimer = 0;
$("#taskList").addEventListener("input", (e) => {
  if (!e.target.matches('[data-field="notes"]')) return;
  clearTimeout(notesTimer);
  const el = e.target; notesTimer = setTimeout(() => saveField(el), 500);
});
$("#taskList").addEventListener("focusout", (e) => { if (e.target.matches("[data-field]")) { clearTimeout(notesTimer); saveField(e.target); } });
document.addEventListener("pointerdown", (e) => {
  if (!S.openTask || e.target.closest(".task.open, #whenPop, #labelPop, #pop, .toast")) return;
  const el = document.activeElement; if (el && el.matches && el.matches("[data-field]")) saveField(el);
  S.openTask = null; S.confirmDel = null; renderTasks();
});

// Mouse users drag the whole row once it moves a few pixels; touch keeps the grip so lists still scroll.
let pendingDrag = null, dragJustEnded = false;
$("#taskList").addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button > 0 || drag || S.projectFilter) return;
  const li = e.target.closest(".task");
  if (!li || li.classList.contains("open") || e.target.closest("button, input, textarea, a, .task-card")) return;
  pendingDrag = { x: e.clientX, y: e.clientY, li, id: e.pointerId };
});
$("#taskList").addEventListener("pointermove", (e) => {
  if (!pendingDrag || e.pointerId !== pendingDrag.id || drag) return;
  if (Math.hypot(e.clientX - pendingDrag.x, e.clientY - pendingDrag.y) < 5) return;
  const li = pendingDrag.li; pendingDrag = null;
  startDrag(e, li);
});
addEventListener("pointerup", () => { pendingDrag = null; });
$("#taskList").addEventListener("pointerdown", (e) => {
  const g = e.target.closest(".grip:not(.sec-grip)");
  if (!g || g.disabled || drag || e.button > 0) return;
  e.preventDefault();
  startDrag(e, g.closest(".task"));
});
function startDrag(e, li) {
  if (guardPreview()) return;
  const ul = $("#taskList");
  const r = li.getBoundingClientRect(), slot = document.createElement("li");
  slot.className = "task-drop"; slot.setAttribute("aria-hidden", "true");
  const panel = ul.closest(".panel");
  drag = { ul, li, slot, next: li.nextElementSibling, from: groupBefore(ul, li), id: e.pointerId, offset: e.clientY - r.top, y: e.clientY, frame: null,
    scroller: panel && getComputedStyle(panel).overflowY === "auto" ? panel : null };
  try { ul.setPointerCapture(e.pointerId); } catch {}
  ul.insertBefore(slot, li); document.body.appendChild(li);
  li.classList.add("dragging"); ul.classList.add("sorting");
  li.style.left = r.left + "px"; li.style.width = r.width + "px";
  slot.style.height = li.offsetHeight + "px";
  updateDrop(e.clientY); drag.frame = requestAnimationFrame(dragScroll);
  if (!calm()) li.animate([{ transform: "none", boxShadow: "none", offset: 0 }], { duration: 180, easing: EASE });
}
$("#taskList").addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.y = e.clientY; updateDrop(e.clientY);
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  finishDrag(e.type !== "pointerup");
};
$("#taskList").addEventListener("pointerup", endDrag);
$("#taskList").addEventListener("pointercancel", endDrag);
$("#taskList").addEventListener("lostpointercapture", endDrag);
document.addEventListener("keydown", (e) => { if (drag && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishDrag(true); } }, true);
$("#taskList").addEventListener("keydown", (e) => {
  if (e.target.matches("[data-subtitle]")) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (e.key === "Escape") {
      e.stopPropagation();
      const task = S.tasks.get(e.target.closest(".task").dataset.id);
      const sub = (task && task.subtasks || []).find((s) => s.id === e.target.closest(".subtask").dataset.subid);
      if (sub) e.target.value = sub.title;
    }
    return;
  }
  if (e.target.matches(".sec-grip") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const id = e.target.closest(".group.section").dataset.g.slice(4), i = sections().findIndex((x) => x.id === id);
    if (moveSection(id, i + (e.key === "ArrowUp" ? -1 : 1))) $('#taskList [data-g="sec:' + id + '"] .sec-grip')?.focus();
    return;
  }
  const g = e.target.closest(".grip");
  if (g && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    if (guardPreview()) return;
    const li = g.closest(".task"), ul = li.parentNode, id = li.dataset.id;
    if (e.key === "ArrowUp") {
      const prev = li.previousElementSibling;
      if (!prev || (prev === ul.firstElementChild && prev.classList.contains("group"))) return;
      ul.insertBefore(li, prev);
    } else {
      if (!li.nextElementSibling) return;
      ul.insertBefore(li.nextElementSibling, li);
    }
    commitOrder();
    const again = [...ul.querySelectorAll(".task")].find((x) => x.dataset.id === id);
    if (again) again.querySelector(".grip").focus();
    return;
  }
  if (e.target.matches('[data-field="title"], .sec-title') && e.key === "Enter") { e.preventDefault(); e.target.blur(); return; }
  if (e.target.matches(".sec-title") && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const sec = sections().find((x) => x.id === e.target.dataset.sec); if (sec) e.target.value = sec.title; e.target.blur(); return; }
  const li = e.target.closest(".task");
  if (li && e.key === "Escape" && li.classList.contains("open")) {
    e.preventDefault(); e.stopPropagation();
    if (e.target.matches("[data-field]")) saveField(e.target);
    toggleCard(li.dataset.id);
    return;
  }
  if (e.target !== li) return;
  if (e.key === "Enter") { e.preventDefault(); toggleCard(li.dataset.id, true); }
  else if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault(); e.stopPropagation();
    const rows = [...$("#taskList").querySelectorAll(".task")], i = rows.indexOf(li);
    focusRow(rows[i + (e.key === "ArrowDown" || e.key === "j" ? 1 : -1)]);
  }
});
$("#statsFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  S.statsFilter = b.dataset.filter; S.logN = 8; S.showAll = false;
  renderStats();
  $('#statsFilter [aria-pressed="true"]')?.focus();
});
$("#byRange").addEventListener("click", (e) => {
  const b = e.target.closest("[data-range]");
  if (!b) return;
  S.byRange = b.dataset.range;
  renderStats();
  $('#byRange [aria-pressed="true"]')?.focus();
});
let sesTimer = null;
$("#sessions").addEventListener("click", (e) => {
  if (e.target.id === "sesMore") { S.logN += 20; renderStats(); return; }
  const tr = e.target.closest("[data-ses]"); if (!tr) return;
  const key = tr.dataset.ses, mv = e.target.closest("[data-move]");
  const label = e.target.closest("[data-session-label]");
  if (label) {
    if (guardPreview()) return;
    const r = sesAt(key); if (!r) return;
    const find = () => [...$("#sesTable").querySelectorAll("[data-ses]")].find((row) => row.dataset.ses === key)?.querySelector("[data-session-label]");
    openLabelPop("session:" + key, find, sessionProject(r.t, r.t.sessions[r.i]), (name) => labelSession(key, name));
  } else if (mv) {
    if (!pop.hidden) { closePop(); return; }
    if (guardPreview()) return;
    const r = sesAt(key); if (!r) return;
    openPop(mv, moveItems(), r.t.system ? "" : r.t.id, (id) => moveSession(key, id));
  } else if (e.target.closest("[data-sdel]")) {
    if (guardPreview()) return;
    clearTimeout(sesTimer);
    if (S.confirmSes === key) { S.confirmSes = null; deleteSession(key); }
    else { S.confirmSes = key; renderStats(); sesTimer = setTimeout(() => { S.confirmSes = null; renderStats(); }, 3000); }
  }
});
pop.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) popChoose(+li.dataset.i); });
pop.addEventListener("pointermove", (e) => { const li = e.target.closest("li"); if (li && +li.dataset.i !== popIdx) popMove(+li.dataset.i); });
pop.addEventListener("keydown", (e) => {
  const k = e.key, last = popItems.length - 1;
  e.stopPropagation();
  if (k === "Tab") { closePop(); return; }
  if (k === "Escape") closePop(true);
  else if (k === "ArrowDown") popMove(Math.min(last, popIdx + 1));
  else if (k === "ArrowUp") popMove(Math.max(0, popIdx - 1));
  else if (k === "Home") popMove(0);
  else if (k === "End") popMove(last);
  else if (k === "Enter" || k === " ") popChoose(popIdx);
  else if (k.length === 1 && popItems.some((o) => o.key === k.toUpperCase())) popChoose(popItems.findIndex((o) => o.key === k.toUpperCase()));
  else return;
  e.preventDefault();
});
document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !e.target.closest("#pop, [data-move]")) closePop(); });
function quickDays() {
  const now = Date.now();
  return { today: "today", tomorrow: dayKey(addDays(now, 1)), week: nextMonday(now), later: "later" };
}

const inDays = (k) => { const n = Math.round((keyTime(k) - sod(Date.now())) / 864e5); return n <= 0 ? "today" : n === 1 ? "tomorrow" : n < 14 ? "in " + n + " days" : "in " + Math.round(n / 7) + " weeks"; };

const WHEN_ICON = {
  today: '<svg class="ic-today" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>',
  day: '<svg class="ic-day" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  week: '<svg class="ic-week" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6M20 5v14"/></svg>',
  later: '<svg class="ic-later" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/></svg>',
};
const whenPop = $("#whenPop"), whenInput = $("#whenInput"), whenList = $("#whenList"), calGrid = $("#calGrid");
const WHEN = { task: null, anchor: null, items: [], idx: 0, month: 0, focus: "", preview: "" };
const weekStart = (() => {
  try { const l = new Intl.Locale(navigator.language), w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo; return w ? w.firstDay % 7 : 1; } catch { return 1; }
})();
function whenItems() {
  const q = quickDays(), typed = whenInput.value.trim(), items = [];
  if (typed) {
    const g = parseWhen(typed);
    if (g === undefined) items.push({ off: true, icon: WHEN_ICON.day, title: "No day matches “" + typed + "”" });
    else if (g === "later") items.push({ g, icon: WHEN_ICON.later, title: "Later", note: "no day", parsed: true });
    else if (g === "today" || g <= todayKey()) items.push({ g: "today", icon: WHEN_ICON.today, title: "Today", parsed: true });
    else items.push({ g, icon: WHEN_ICON.day, title: fmtDate(keyTime(g), { weekday: "short", day: "numeric", month: "short" }), note: inDays(g), parsed: true });
  }
  items.push({ g: "today", icon: WHEN_ICON.today, title: "Today", key: "T" },
    { g: q.tomorrow, icon: WHEN_ICON.day, title: "Tomorrow", note: fmtDate(keyTime(q.tomorrow), { weekday: "short" }), key: "M" },
    { g: q.week, icon: WHEN_ICON.week, title: "Next week", note: shortDay(q.week), key: "W" },
    { g: "later", icon: WHEN_ICON.later, title: "Later", note: "no day", key: "L" });
  return items;
}
function renderWhen() {
  WHEN.items = whenItems();
  const first = WHEN.items.findIndex((o) => !o.off);
  if (WHEN.idx < first || WHEN.idx >= WHEN.items.length || WHEN.items[WHEN.idx].off) WHEN.idx = first;
  whenList.innerHTML = WHEN.items.map((o, i) => '<li role="option" id="when-' + i + '" data-i="' + i + '"' + (o.off ? ' aria-disabled="true"' : "") + (o.parsed ? ' class="parsed"' : "") + ' aria-selected="' + (i === WHEN.idx) + '">' +
    o.icon + "<span>" + esc(o.title) + "</span>" + (o.note ? "<em>" + esc(o.note) + "</em>" : "") + (o.key ? "<kbd>" + o.key + "</kbd>" : "") + "</li>").join("");
  [...whenList.children].forEach((li, j) => li.classList.toggle("act", j === WHEN.idx));
  whenInput.setAttribute("aria-activedescendant", "when-" + WHEN.idx);
  const parsed = WHEN.items[0] && WHEN.items[0].parsed && WHEN.items[0].g !== "later" ? (WHEN.items[0].g === "today" ? todayKey() : WHEN.items[0].g) : "";
  if (parsed !== WHEN.preview) {
    WHEN.preview = parsed;
    if (parsed) { const d = new Date(keyTime(parsed)); WHEN.month = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); WHEN.focus = parsed; }
  }
  renderCal();
}
function openWhen(anchor, t, onPick) {
  WHEN.onPick = onPick || null;
  const tk = todayKey(), start = t.plan && t.plan > tk ? t.plan : quickDays().tomorrow;
  WHEN.task = t; WHEN.anchor = anchor; WHEN.focus = start; WHEN.idx = 0; WHEN.preview = "";
  const d = new Date(keyTime(start)); WHEN.month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  whenInput.value = "";
  whenPop.hidden = false;
  renderWhen();
  // Hover-only buttons have no box while hidden; fall back to their row.
  let r = anchor.getBoundingClientRect();
  if (!r.width && !r.height) r = (anchor.closest(".task") || $("#taskList")).getBoundingClientRect();
  const w = whenPop.offsetWidth, h = whenPop.offsetHeight;
  const above = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8;
  whenPop.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + "px";
  whenPop.style.top = Math.max(8, above ? r.top - 6 - h : Math.min(r.bottom + 6, innerHeight - h - 8)) + "px";
  whenPop.style.transformOrigin = (above ? "bottom" : "top") + " right";
  // On phones a focused field would pop the keyboard over the calendar.
  if (matchMedia("(hover: hover)").matches) whenInput.focus({ preventScroll: true }); else whenPop.focus({ preventScroll: true });
}
function closeWhen(refocus) {
  if (whenPop.hidden) return;
  whenPop.hidden = true;
  const a = WHEN.anchor;
  if (!refocus || !a || !a.isConnected) return;
  a.focus({ preventScroll: true });
  if (document.activeElement !== a) a.closest(".task")?.focus({ preventScroll: true });
}
function chooseWhen(g) {
  const t = WHEN.task, cb = WHEN.onPick; closeWhen(true);
  if (!g) return;
  if (cb) cb(g); else if (t) scheduleTask(t.id, g);
}
function renderCal() {
  const first = new Date(WHEN.month), y = first.getFullYear(), m = first.getMonth(), tk = todayKey();
  const load = new Map();
  for (const t of openOf(S.tasks)) { const k = isToday(t) ? tk : t.plan; if (k) load.set(k, (load.get(k) || 0) + 1); }
  $("#calMonth").textContent = fmtDate(WHEN.month, { month: "long", year: "numeric" });
  const offset = (first.getDay() - weekStart + 7) % 7;
  let html = "";
  for (let i = 0; i < 7; i++) html += '<span class="wd" aria-hidden="true">' + esc(fmtDate(new Date(y, m, 1 - offset + i).getTime(), { weekday: "narrow" })) + "</span>";
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - offset + i), k = dayKey(d.getTime()), n = Math.min(3, load.get(k) || 0);
    html += '<button type="button" data-day="' + k + '" tabindex="' + (k === WHEN.focus ? 0 : -1) + '"' + (k < tk ? " disabled" : "") +
      ' class="' + (d.getMonth() !== m ? "out " : "") + (k === tk ? "today " : "") + (k === WHEN.preview ? "preview" : "") + '" aria-pressed="' + (WHEN.task && WHEN.task.plan === k) + '"' +
      ' aria-label="' + esc(fmtDate(d.getTime(), { weekday: "long", day: "numeric", month: "long" }) + (load.get(k) ? ", " + plural(load.get(k), "task") + " planned" : "")) + '">' +
      d.getDate() + (n ? "<i>" + "<b></b>".repeat(n) + "</i>" : "") + "</button>";
  }
  calGrid.innerHTML = html;
}
function calFocus(k) {
  if (k < todayKey()) k = todayKey();
  WHEN.focus = k;
  const d = new Date(keyTime(k)); WHEN.month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  renderCal();
  calGrid.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
}
whenInput.addEventListener("input", () => { WHEN.idx = 0; renderWhen(); });
whenInput.addEventListener("keydown", (e) => {
  const k = e.key, step = (dir) => { let i = WHEN.idx; do { i = (i + dir + WHEN.items.length) % WHEN.items.length; } while (WHEN.items[i].off && i !== WHEN.idx); WHEN.idx = i; renderWhen(); };
  if (k === "ArrowDown") step(1);
  else if (k === "ArrowUp") step(-1);
  else if (k === "Enter") { const o = WHEN.items[WHEN.idx]; if (o && !o.off) chooseWhen(o.g); }
  else if (k === "Escape") closeWhen(true);
  else return;
  e.preventDefault(); e.stopPropagation();
});
whenList.addEventListener("click", (e) => { const li = e.target.closest("li"); const o = li && WHEN.items[+li.dataset.i]; if (o && !o.off) chooseWhen(o.g); });
whenList.addEventListener("pointermove", (e) => { const li = e.target.closest("li"); if (li && !WHEN.items[+li.dataset.i].off && +li.dataset.i !== WHEN.idx) { WHEN.idx = +li.dataset.i; [...whenList.children].forEach((x, j) => x.classList.toggle("act", j === WHEN.idx)); } });
calGrid.addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b && !b.disabled) chooseWhen(b.dataset.day); });
whenPop.addEventListener("click", (e) => {
  const stepBtn = e.target.closest("[data-cal-step]");
  if (!stepBtn) return;
  const d = new Date(WHEN.month); WHEN.month = new Date(d.getFullYear(), d.getMonth() + +stepBtn.dataset.calStep, 1).getTime();
  renderCal();
});
calGrid.addEventListener("keydown", (e) => {
  e.stopPropagation();
  const k = e.key, at = keyTime(WHEN.focus || todayKey()), d = new Date(at);
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
  if (k === "Escape") closeWhen(true);
  else if (move) calFocus(dayKey(addDays(at, move)));
  else if (k === "PageUp" || k === "PageDown") calFocus(dayKey(new Date(d.getFullYear(), d.getMonth() + (k === "PageUp" ? -1 : 1), Math.min(d.getDate(), 28)).getTime()));
  else if (k === "Home") calFocus(dayKey(addDays(at, -((d.getDay() - weekStart + 7) % 7))));
  else if (k === "End") calFocus(dayKey(addDays(at, 6 - ((d.getDay() - weekStart + 7) % 7))));
  else return;
  e.preventDefault();
});
whenPop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeWhen(true); } });
whenPop.tabIndex = -1;
document.addEventListener("pointerdown", (e) => { if (!whenPop.hidden && !e.target.closest("#whenPop, [data-sched]")) closeWhen(); });
addEventListener("resize", () => closeWhen());
addEventListener("scroll", (e) => { if (!whenPop.contains(e.target)) closeWhen(); }, true);

// ---------- scheduling shortcuts ----------
// They act on the task under the mouse or keyboard focus, else the one you're working on.
let hoverTask = "";
$("#taskList").addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") hoverTask = e.target.closest(".task")?.dataset.id || ""; });
$("#taskList").addEventListener("pointerleave", () => { hoverTask = ""; });
function shortcutTask() {
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest("#taskList .task");
  const id = focused ? focused.dataset.id : hoverTask || S.activeId;
  const t = id && S.tasks.get(id);
  return t && !t.done && !t.system ? t : null;
}
// ⌥↑/⌥↓ move a task one place (past a heading counts as a step); with ⇧ it jumps a whole section, or a day in Upcoming.
function moveTaskKey(up, jump) {
  const t = shortcutTask();
  if (!t) { toast("Point at a task or pick one to work on first."); return; }
  if (guardPreview()) return;
  if (S.projectFilter) { toast("Show all tasks to reorder."); return; }
  const ul = $("#taskList"), li = [...ul.querySelectorAll(".task")].find((x) => x.dataset.id === t.id);
  if (!li) return;
  const before = groupBefore(ul, li), heads = [...ul.children].filter((el) => el.classList.contains("group") && !el.classList.contains("month"));
  if (!jump && up) {
    const prev = li.previousElementSibling;
    if (!prev || (prev === ul.firstElementChild && prev.classList.contains("group"))) return;
    ul.insertBefore(li, prev);
  } else if (!jump) {
    if (!li.nextElementSibling) return;
    ul.insertBefore(li.nextElementSibling, li);
  } else {
    let cur = null;
    for (const el of ul.children) { if (el === li) break; if (el.classList.contains("group")) cur = el; }
    const i = heads.indexOf(cur);
    if (up) { if (i <= 0) return; ul.insertBefore(li, cur); }
    else { const next = heads[i + 1]; if (!next) return; ul.insertBefore(li, next.nextSibling); }
  }
  const after = groupBefore(ul, li);
  commitOrder();
  if (after !== before) toast("Moved “" + t.title + "” to " + groupName(after) + ".");
  focusRow([...ul.querySelectorAll(".task")].find((x) => x.dataset.id === t.id));
}
function scheduleShortcut(key) {
  const t = shortcutTask();
  if (!t) { toast("Point at a task, or pick one to work on, then press " + key.toUpperCase() + "."); return; }
  if (guardPreview()) return;
  const q = quickDays();
  if (key === "d") {
    const row = [...$("#taskList").querySelectorAll(".task")].find((li) => li.dataset.id === t.id);
    openWhen(row ? row.querySelector("[data-sched]") || row : $("#taskPick"), t);
    return;
  }
  scheduleTask(t.id, { t: q.today, m: q.tomorrow, w: q.week, l: q.later }[key]);
}
$("#taskViews").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (!b || b.dataset.view === S.taskView) return;
  S.taskView = b.dataset.view; ss.set("pl.taskView", S.taskView);
  renderTasks();
});
$("#dayFitMove").addEventListener("click", () => {
  if (guardPreview()) return;
  const ids = ($("#dayFit").dataset.ids || "").split(",").filter((id) => S.tasks.has(id));
  if (!ids.length) return;
  const tomorrow = dayKey(addDays(Date.now(), 1));
  let last = Math.max(-1, ...openOf(S.tasks).filter((x) => inGroup(x, tomorrow)).map(ord));
  leaveRows(ids, () => {
    Store.saveTasks(ids.map((id) => placed(S.tasks.get(id), tomorrow, ++last)));
    toast("Moved " + plural(ids.length, "task") + " to tomorrow.");
  });
});
addEventListener("scroll", (e) => { if (e.target !== pop) closePop(); }, true);
addEventListener("resize", () => closePop());
$("#ledger").addEventListener("click", (e) => {
  const r = e.target.closest("[data-reopen]");
  if (r) { if (guardPreview()) return; const t = S.tasks.get(r.dataset.reopen); if (!t) return; const n = clone(t); n.done = false; n.doneAt = null; Store.saveTask(n); toast("Moved “" + t.title + "” back to open tasks."); return; }
  if (e.target.id === "toggleAll") { S.showAll = !S.showAll; renderStats(); }
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea" || !$("#settings").hidden || !$("#room").hidden || !$("#keys").hidden) {
    if (e.key === "Escape") { if (!$("#settings").hidden) closeSettings(); else if (!$("#room").hidden) closeRoom(); else if (!$("#keys").hidden) closeKeys(); }
    return;
  }
  if (e.key === "?" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openKeys(); return; }
  if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey && !document.body.classList.contains("zen")) {
    e.preventDefault();
    if (phone()) showPage("tasks");
    $("#newTitle").focus();
    return;
  }
  if (e.code === "Space" && tag !== "button") { e.preventDefault(); toggle(); }
  else if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey) skip();
  else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleZen(e.shiftKey);
  else if ((e.key === "+" || e.key === "=") && !e.metaKey && !e.ctrlKey) adjust(1);
  else if (e.key === "-" && !e.metaKey && !e.ctrlKey) adjust(-1);
  else if (e.key === "Escape" && document.body.classList.contains("zen")) toggleZen(false);
  else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.altKey && !e.metaKey && !e.ctrlKey && !document.body.classList.contains("zen")) { e.preventDefault(); moveTaskKey(e.key === "ArrowUp", e.shiftKey); }
  else if (/^[tmwld]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !document.body.classList.contains("zen")) { e.preventDefault(); scheduleShortcut(e.key.toLowerCase()); }
  else if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !document.body.classList.contains("zen") && !$("#taskList").contains(document.activeElement)) {
    const rows = [...$("#taskList").querySelectorAll(".task")];
    if (!rows.length) return;
    e.preventDefault();
    const start = rows.find((li) => li.dataset.id === (hoverTask || S.activeId));
    focusRow(start || (e.key === "ArrowUp" || e.key === "k" ? rows.at(-1) : rows[0]));
  }
});

// settings
const F = { sFocus: "focus", sShort: "short", sLong: "long", sEvery: "longEvery", sGoal: "goal" };
const B = { sAutoBreak: "autoBreak", sAutoFocus: "autoFocus", sSound: "sound", sNotify: "notify", sTicking: "ticking", sAutoFloat: "autoFloat" };
function fillTicking() {
  $("#tickingOptions").hidden = !S.settings.ticking;
  $("#sTickVolume").value = S.settings.tickVolume;
  $("#tickVolumeValue").textContent = S.settings.tickVolume + "%";
  $("#sTickPace").value = S.settings.tickPace;
}
function fillSettings() {
  for (const [id, k] of Object.entries(F)) { const el = $("#" + id); if (document.activeElement !== el) el.value = S.settings[k]; }
  for (const [id, k] of Object.entries(B)) $("#" + id).checked = !!S.settings[k];
  if (document.activeElement !== $("#sDayEnd")) $("#sDayEnd").value = S.settings.workdayEnd || "";
  fillTicking();
}
let modalScroll = null;
function setOverlay(id, open) {
  const overlay = $(id);
  if (open && modalScroll === null) {
    modalScroll = scrollY;
    const bounds = document.body.getBoundingClientRect();
    document.body.style.setProperty("--modal-top", bounds.top + "px");
    document.body.style.setProperty("--modal-width", bounds.width + "px");
    document.body.classList.add("modal-open");
  }
  overlay.hidden = !open;
  if (!open && modalScroll !== null && $("#room").hidden && $("#settings").hidden && $("#keys").hidden) {
    const top = modalScroll;
    modalScroll = null;
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("--modal-top");
    document.body.style.removeProperty("--modal-width");
    window.scrollTo(0, top);
    requestAnimationFrame(sizeTimer);
  }
}
function renderSyncTab() {
  const st = Cloud.state, viaClaude = Cloud.state === "off" && S.storeMode === "db";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const copy = {
    off: viaClaude ? ["Synced to your account", "Tasks, history and settings sync automatically."] : ["Saved in this browser", "Account sync isn't set up on this server, so everything stays on this device."],
    signedout: ["Not signed in", "Sign in to keep tasks, history and settings in sync across your devices. What's already here is added to your account."],
    connecting: ["Connecting…", Cloud.email],
    live: ["Synced", Cloud.email],
    offline: ["Offline", "Changes are saved here and sync when you're back online. " + Cloud.email],
  }[st];
  $("#syncTitle").textContent = copy[0];
  $("#syncDetail").textContent = copy[1];
  $("#syncActs").innerHTML = st === "signedout" ? '<a class="btn small solid" href="/api/sync/login">Sign in</a>'
    : ["live", "offline", "connecting"].includes(st) ? '<a class="btn small" href="/api/sync/export" download>Export</a>' + (local ? "" : '<button class="btn small" type="button" id="syncOut">Sign out</button>') : "";
  $("#syncHint").textContent = ["live", "offline", "connecting"].includes(st) ? "The timer and the task you're working on sync too. Export downloads everything as JSON." : "";
}
$("#syncActs").addEventListener("click", (e) => {
  if (e.target.id !== "syncOut") return;
  ls.set("pl.syncEmail", "");
  location.href = "/cdn-cgi/access/logout";
});
$("#syncPill").addEventListener("click", () => { if (DEMO) return; fillSettings(); setOverlay("#settings", true); showSetTab("sync", true); });
const setTabs = [...document.querySelectorAll("#settingsForm [role=tab]")];
function showSetTab(name, focus) {
  for (const t of setTabs) {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    $("#" + t.getAttribute("aria-controls")).setAttribute("aria-hidden", !on);
    if (on && focus) t.focus();
  }
  ls.set("pl.setTab", name);
}
showSetTab(setTabs.some((t) => t.dataset.tab === ls.get("pl.setTab")) ? ls.get("pl.setTab") : "timer");
for (const t of setTabs) {
  t.addEventListener("click", () => showSetTab(t.dataset.tab));
  t.addEventListener("keydown", (e) => {
    const i = setTabs.indexOf(t), n = setTabs.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); showSetTab(setTabs[j].dataset.tab, true);
  });
}
// ---------- theme: system, light or dark, remembered per device ----------
const THEMES = ["system", "light", "dark"];
const THEME_ICON = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
function applyTheme(t) {
  if (!THEMES.includes(t)) t = "system";
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  // Keep the browser's tab and status bar colour in step with a forced theme.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const own = m.media.includes("dark") ? "#0E1110" : "#EDEFEC";
    m.content = t === "system" ? own : t === "dark" ? "#0E1110" : "#EDEFEC";
  });
  const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length], name = (x) => x[0].toUpperCase() + x.slice(1);
  const b = $("#themeBtn");
  b.innerHTML = THEME_ICON[t];
  b.setAttribute("aria-label", "Theme: " + name(t) + ". Switch to " + name(next));
  b.title = "Theme: " + name(t) + " · click for " + name(next);
  if (floatWindow && !floatWindow.closed) renderFloating(lastTxt, 0);
}
$("#themeBtn").addEventListener("click", () => {
  const cur = ls.get("pl.theme", "system"), next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  ls.set("pl.theme", next);
  applyTheme(next);
  toast("Theme: " + next[0].toUpperCase() + next.slice(1) + (next === "system" ? " (follows your device)" : "") + ".");
});
applyTheme(ls.get("pl.theme", "system"));
function openKeys() { setOverlay("#keys", true); $("#closeKeys").focus({ preventScroll: true }); }
function closeKeys() { setOverlay("#keys", false); $("#openKeys").focus({ preventScroll: true }); }
$("#openKeys").addEventListener("click", openKeys);
$("#closeKeys").addEventListener("click", closeKeys);
$("#keys").addEventListener("click", (e) => { if (e.target.id === "keys") closeKeys(); });
function closeSettings() { cancelTickPreview(); setOverlay("#settings", false); $("#openSettings").focus({ preventScroll: true }); }
$("#openSettings").addEventListener("click", () => { fillSettings(); setOverlay("#settings", true); $("#settingsForm [aria-selected=true]").focus({ preventScroll: true }); });
$("#closeSettings").addEventListener("click", closeSettings);
$("#testSound").addEventListener("click", () => { if (!S.settings.sound) { toast("Turn sounds on first."); return; } playSound("focus"); });
$("#testTicking").addEventListener("click", () => {
  ensureAudio(); cancelTickPreview();
  if (!S.settings.ticking) { toast("Turn ticking on first."); return; }
  if (T.status === "running" && T.mode === "focus") { toast("The ticking is already playing with your timer."); return; }
  try { tickPreview = tickingNode(6); } catch {}
});
$("#settings").addEventListener("click", (e) => { if (e.target.id === "settings") closeSettings(); });
$("#settingsForm").addEventListener("submit", (e) => { e.preventDefault(); closeSettings(); });
$("#settingsForm").addEventListener("input", (e) => {
  const id = e.target.id;
  if (F[id]) {
    const el = e.target, v = Math.round(+el.value);
    if (!v || v < +el.min || v > +el.max) { $("#setNote").textContent = "Use a number from " + el.min + " to " + el.max + "."; return; }
    S.settings[F[id]] = v;
  } else if (B[id]) S.settings[B[id]] = e.target.checked;
  else if (id === "sTickVolume") S.settings.tickVolume = Math.max(0, Math.min(100, +e.target.value));
  else if (id === "sTickPace") S.settings.tickPace = [1, 2, 4].includes(+e.target.value) ? +e.target.value : 2;
  else if (id === "sDayEnd") S.settings.workdayEnd = /^\d\d:\d\d$/.test(e.target.value) ? e.target.value : "";
  if (["sTicking", "sTickVolume", "sTickPace"].includes(id)) { cancelTickPreview(); fillTicking(); syncTicking(); }
  $("#setNote").textContent = "Saved.";
  Store.saveSettings();
  if (T.setIndex > S.settings.longEvery) T.setIndex = 0;
  if (id === "sNotify" && S.settings.notify) askNotify();
  if (id === "sSound") { if (S.settings.sound) scheduleEnd(); else cancelEnd(); }
  if (id === "sAutoFloat") autoFloatHandler();
  renderTimer(true); renderStats(); renderEstPick();
});

// ---------- shared room ----------
const ss = {
  get(k) { if (DEMO) return null; try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { if (DEMO) return; try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} },
};
const RM = { owner: false, ws: null, code: ss.get("pl.room"), id: ss.get("pl.rid"), name: ls.get("pl.name", ""), you: null, members: [], prop: null, live: false, tries: 0, timer: null, ping: null, sent: "", askHTML: "" };
if (!RM.id) { RM.id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); ss.set("pl.rid", RM.id); }
const normCode = (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const roomSend = (o) => { try { if (RM.ws && RM.ws.readyState === 1) RM.ws.send(JSON.stringify(o)); } catch {} };
function roomPush(force) {
  if (!RM.live) return;
  const total = Math.round(totalNow()), key = [T.mode, T.status, T.status === "running" ? T.endsAt : Math.round(remNow()), total].join("|");
  if (key === RM.sent && !force) return;
  RM.sent = key;
  roomSend({ t: "state", s: { mode: T.mode, status: T.status, remaining: Math.round(remNow()), total } });
}
function roomReset() {
  clearTimeout(RM.timer); clearInterval(RM.ping);
  const ws = RM.ws;
  RM.owner = false; RM.ws = null; RM.code = null; RM.live = false; RM.members = []; RM.prop = null; RM.tries = 0;
  ss.set("pl.room", null);
  if (ws) try { ws.close(1000); } catch {}
  renderRoom();
}
function roomConnect() {
  clearTimeout(RM.timer);
  if (!RM.code) return;
  let ws;
  try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/room/" + RM.code + "/ws"); } catch { return; }
  RM.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: "hello", id: RM.id, name: RM.name, ownerToken: ss.get("pl.owner." + RM.code) }));
  ws.onmessage = (e) => {
    if (ws !== RM.ws || e.data === "pong") return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    roomMsg(m);
  };
  ws.onclose = (e) => {
    if (ws !== RM.ws) return;
    const was = RM.live;
    RM.ws = null; RM.live = false; clearInterval(RM.ping);
    const gone = { 4005: "The room creator removed you from the room.", 4000: "Couldn't join that room.", 4001: "This room was opened in another tab.", 4003: "That room is full.", 4004: "That room doesn't exist, or it has already closed." }[e.code];
    if (gone || (!was && ++RM.tries > 3)) { roomReset(); toast(gone || "Couldn't reach the room. Check your connection and try again."); return; }
    RM.timer = setTimeout(roomConnect, Math.min(15000, 1000 * 2 ** RM.tries));
    renderRoom();
  };
}
function roomMsg(m) {
  if (m.t === "note") toast(m.msg);
  else if (m.t === "sync") applySync(m);
  else if (m.t === "room") {
    const skew = Date.now() - m.now, had = RM.prop;
    RM.you = m.you; RM.owner = !!m.owner;
    RM.members = m.members.map((x) => ({ id: x.id, name: x.name, owner: !!x.owner, s: x.s && { ...x.s, end: x.s.end ? x.s.end + skew : 0 } }));
    RM.prop = m.prop;
    if (!RM.live) {
      RM.live = true; RM.tries = 0;
      clearInterval(RM.ping); RM.ping = setInterval(() => { try { RM.ws && RM.ws.send("ping"); } catch {} }, 25000);
      roomPush(true);
    }
    if (RM.prop && !had && RM.prop.by !== RM.you) { playSound("task"); notify("Someone in your room wants to sync timers."); }
    renderRoom();
  }
}
function applySync(m) {
  const s = m.s;
  if (m.by === RM.you && T.status !== "idle") { toast("Everyone accepted. Your timers are in sync."); return; }
  if (T.mode !== s.mode) setMode(s.mode, true);
  const done = T.status === "idle" ? 0 : (T.total || 0) - remNow();
  cancelEnd();
  delete T.adj[T.mode];
  T.total = done + s.remaining; T.remaining = s.remaining; T.endsAt = 0; T.status = "paused";
  if (s.status === "running") start(); else { wakeOff(); saveTimer(); renderTimer(true); }
  toast(m.by === RM.you ? "Everyone accepted. Starting together." : "Synced to " + m.name + "'s timer.");
}
function roomEnter(code) {
  RM.code = code; RM.tries = 0; ss.set("pl.room", code);
  setOverlay("#room", false);
  renderRoom(); roomConnect();
}
function roomName() {
  const name = $("#rName").value.trim().slice(0, 20);
  if (!name) { $("#roomNote").textContent = "Add a name so the others know who you are."; $("#rName").focus(); return false; }
  RM.name = name; ls.set("pl.name", name);
  return true;
}
function mateState(s, withName) {
  if (!s) return withName ? "<em>Ready to focus</em>" : "";
  if (s.status === "idle") return withName ? "<em>Ready to focus</em>" : "start a " + Math.round(s.total / MIN) + " min " + MODE_NAME[s.mode].toLowerCase() + " together now";
  const t = s.status === "running" ? '<span data-end="' + s.end + '"></span>' : "<span>" + clock(Math.ceil(s.rem / 1000)) + "</span>";
  if (withName) return t + "<em>" + MODE_NAME[s.mode] + (s.status === "paused" ? " · paused" : "") + "</em>";
  return MODE_NAME[s.mode].toLowerCase() + ", " + (s.status === "paused" ? "paused at " + t : t + " left");
}
function renderRoom() {
  const on = !!RM.code, ask = $("#ask");
  if ($("#roomStrip").hidden === on) requestAnimationFrame(sizeTimer);
  $("#roomStrip").hidden = !on;
  $("#openRoom").classList.toggle("on", on);
  $("#roomOut").hidden = on; $("#roomIn").hidden = !on; $("#rName").disabled = on;
  $("#bigCode").textContent = RM.code || "";
  let html = "";
  if (on) {
    const others = RM.members.filter((m) => m.id !== RM.you), p = RM.live && RM.prop;
    $("#stripCode").innerHTML = "<small>Room</small>" + esc(RM.code);
    $("#mates").innerHTML = !RM.live ? '<li class="hint">Connecting…</li>'
      : !others.length ? '<li class="hint">Nobody else is here yet. Share the code or the invite link.</li>'
      : others.map((m) => '<li class="mate" data-member="' + esc(m.id) + '" data-mode="' + (m.s ? m.s.mode : "") + '" data-status="' + (m.s ? m.s.status : "idle") + '"><i aria-hidden="true"></i><b>' + esc(m.name) + "</b>" + mateState(m.s, true) + (RM.owner && !m.owner ? '<button class="kick" type="button" data-kick="' + esc(m.id) + '" aria-label="Remove ' + esc(m.name) + ' from room" title="Remove from room">×</button>' : "") + "</li>").join("");
    $("#syncAll").disabled = !RM.live || !others.length || !!RM.prop;
    if (p) {
      const by = RM.members.find((m) => m.id === p.by), count = p.yes.length + " of " + RM.members.length + " accepted";
      if (p.by === RM.you) html = "<p>You asked everyone to sync to your timer. " + count + '.</p><div><button class="btn small" type="button" data-ask="cancel">Cancel</button></div>';
      else if (p.yes.includes(RM.you)) html = "<p>You accepted. Waiting for the others: " + count + ".</p>";
      else html = "<p><b>" + esc(by ? by.name : "Someone") + "</b> wants everyone to sync to their timer: " + mateState(by && by.s) + '. Your timer would jump to theirs.</p><div><button class="btn small" type="button" data-ask="no">Decline</button><button class="btn small solid" type="button" data-ask="yes">Accept</button></div>';
    }
  }
  if (html !== RM.askHTML) { RM.askHTML = html; ask.innerHTML = html; }
  ask.hidden = !html;
  roomTick();
}
function roomTick() {
  document.querySelectorAll("#mates .mate").forEach((el) => {
    const member = RM.members.find((m) => m.id === el.dataset.member), s = member && member.s;
    const remaining = s ? Math.max(0, s.status === "running" ? s.end - Date.now() : s.rem) : 0;
    const progress = !s || s.status === "idle" || !s.total ? 0 : Math.min(1, Math.max(0, 1 - remaining / s.total));
    el.style.setProperty("--progress", progress * 360 + "deg");
    el.title = s && s.status !== "idle" ? Math.floor(progress * 100) + "% complete" : "Ready to focus";
  });
  document.querySelectorAll("#mates [data-end], #ask [data-end]").forEach((el) => {
    const t = clock(Math.max(0, Math.ceil((+el.dataset.end - Date.now()) / 1000)));
    if (el.textContent !== t) el.textContent = t;
  });
}
function copyInvite() {
  const link = location.origin + "/?room=" + RM.code;
  const done = () => toast("Invite link copied."), fail = () => toast("Share this code: " + RM.code);
  try { navigator.clipboard.writeText(link).then(done, fail); } catch { fail(); }
}
function openRoom() {
  const joining = invite.length === 6 && !RM.code;
  $("#roomH").textContent = joining ? "Join a room" : "Work together";
  $("#roomIntro").textContent = joining
    ? "You've been invited to a shared room. Enter your name and press Join. Your tasks and history stay private."
    : "Start a temporary room and share its code. Everyone in it sees who is focusing or on a break and how much time is left. Your tasks and history stay private.";
  $("#rCreate").hidden = joining;
  $("#rCodeLabel").textContent = joining ? "Room code" : "Or join with a code";
  $("#rJoin button").classList.toggle("solid", joining);
  if (joining) $("#rCode").value = invite;
  $("#rName").value = RM.name;
  $("#roomNote").textContent = "";
  setOverlay("#room", true);
  (RM.code ? $("#rCopy") : !RM.name ? $("#rName") : joining ? $("#rJoin button") : $("#rCreate")).focus({ preventScroll: true });
}
function closeRoom() { setOverlay("#room", false); $("#openRoom").focus({ preventScroll: true }); }
$("#openRoom").addEventListener("click", openRoom);
$("#closeRoom").addEventListener("click", closeRoom);
$("#room").addEventListener("click", (e) => { if (e.target.id === "room") closeRoom(); });
$("#rCreate").addEventListener("click", async () => {
  if (!roomName()) return;
  $("#rCreate").disabled = true;
  try {
    const res = await fetch("/api/room", { method: "POST" }), body = res.ok ? await res.json() : null;
    if (!body || !body.code) throw 0;
    ss.set("pl.owner." + body.code, body.ownerToken);
    roomEnter(body.code);
  } catch { $("#roomNote").textContent = "Couldn't start a room. Check your connection and try again."; }
  $("#rCreate").disabled = false;
});
$("#rJoin").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = normCode($("#rCode").value);
  if (code.length !== 6) { $("#roomNote").textContent = "Room codes have six letters and digits."; $("#rCode").focus(); return; }
  if (roomName()) roomEnter(code);
});
$("#mates").addEventListener("click", (e) => {
  const button = e.target.closest("[data-kick]");
  if (button && RM.owner) roomSend({ t: "kick", id: button.dataset.kick });
});
$("#rLeave").addEventListener("click", () => { roomReset(); closeRoom(); });
$("#stripLeave").addEventListener("click", roomReset);
$("#rCopy").addEventListener("click", copyInvite);
$("#stripCode").addEventListener("click", copyInvite);
$("#syncAll").addEventListener("click", () => roomSend({ t: "propose" }));
$("#ask").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ask]"); if (!b) return;
  roomSend(b.dataset.ask === "cancel" ? { t: "cancel" } : { t: "vote", ok: b.dataset.ask === "yes" });
});

// ---------- phone pages ----------
const PAGES = ["timer", "tasks", "progress"], pageScroll = {};
const phone = () => matchMedia("(max-width: 640px)").matches;
function showPage(name) {
  if (!PAGES.includes(name)) name = "timer";
  const prev = document.body.dataset.page;
  if (prev === name) return;
  const scroller = (n) => n === "timer" ? $(".timer-card") : n === "tasks" ? $(".top > .panel") : $(".progress");
  if (prev) pageScroll[prev] = scroller(prev).scrollTop;
  document.body.dataset.page = name;
  ss.set("pl.page", name);
  document.querySelectorAll(".tabbar [data-page]").forEach((b) => b.dataset.page === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  if (!phone() || !prev) return;
  const el = scroller(name);
  el.scrollTop = pageScroll[name] || 0;
  // Charts measure their width, which is zero while the page is hidden.
  if (name === "progress") renderStats();
  if (name === "timer") sizeTimer();
  el.classList.remove("page-in"); void el.offsetWidth; el.classList.add("page-in");
}
$(".tabbar").addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) showPage(b.dataset.page); });
showPage(ss.get("pl.page") || "timer");

// ---------- loop ----------
function tick() {
  if (T.status === "running" && Date.now() >= T.endsAt) complete(T.endsAt);
  renderTimer(false);
  if (RM.code) roomTick();
}
setInterval(tick, 250);
let rz = null, lastW = 0;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const w = $("#bars").clientWidth; if (w !== lastW) { lastW = w; renderStats(); } }, 150); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { sizeTimer(); tick(); if (T.status === "running") wakeOn(); if (RM.code && !RM.ws) roomConnect(); Cloud.wake(); } });

function sizeViewport() {
  if (!window.visualViewport) return;
  document.documentElement.style.setProperty("--viewport-height", visualViewport.height + "px");
  document.documentElement.style.setProperty("--viewport-top", visualViewport.offsetTop + "px");
}
function sizeTimer() {
  const card = $(".timer-card"), dial = $(".dial-wrap");
  if (modalScroll !== null || document.body.classList.contains("zen")) return;
  const mobile = matchMedia("(max-width: 640px)").matches;
  const landscape = matchMedia("(orientation: landscape)").matches;
  document.body.classList.toggle("landscape-phone", mobile && landscape);
  document.body.classList.toggle("compact-phone", mobile && !landscape && matchMedia("(max-height: 640px)").matches);
  if (!mobile) {
    // The card is sticky, so measure where its column starts in the document rather than where it's stuck now.
    const top = $(".top").getBoundingClientRect().top + scrollY;
    const fit = () => innerHeight - top - 18 - (card.getBoundingClientRect().height - dial.getBoundingClientRect().height);
    // Short windows drop the extras (shortcut hints, cycle dots, spacing) before the dial gets small.
    document.body.classList.remove("short-desk");
    let size = fit();
    if (size < 300) { document.body.classList.add("short-desk"); size = fit(); }
    card.style.setProperty("--desk-dial", Math.max(160, Math.min(380, size)) + "px");
    return;
  }
  if (landscape || document.body.dataset.page !== "timer") return;
  // The shell gives the card a fixed height; whatever its other rows don't need goes to the dial.
  const fit = () => {
    const cs = getComputedStyle(card), gap = parseFloat(cs.rowGap) || 0;
    const rows = [...card.children].filter((el) => el !== dial && !el.classList.contains("glow") && el.offsetHeight);
    const used = rows.reduce((sum, el) => sum + el.offsetHeight, 0) + gap * rows.length + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return card.clientHeight - used - 12;
  };
  // Short screens, or a room strip on top, get the tighter layout before the dial gets small.
  let size = fit();
  if (size < 200 && !document.body.classList.contains("compact-phone")) { document.body.classList.add("compact-phone"); size = fit(); }
  card.style.setProperty("--mobile-dial", Math.max(140, Math.min(380, size)) + "px");
}
// The sticky bar's height decides where the sticky timer card can rest below it.
new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", $(".bar").offsetHeight + "px")).observe($(".bar"));
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 4), { passive: true });
const timerLayout = new ResizeObserver(sizeTimer);
[$(".bar"), $("#roomStrip"), $("#previewBanner"), $(".working")].forEach((el) => timerLayout.observe(el));
addEventListener("resize", sizeTimer);
// The observer above doesn't run in background tabs, and web fonts change heights after the first measure.
if (document.fonts) document.fonts.ready.then(sizeTimer);
if (window.visualViewport) {
  visualViewport.addEventListener("resize", sizeViewport);
  visualViewport.addEventListener("scroll", sizeViewport);
  visualViewport.addEventListener("resize", sizeTimer);
  sizeViewport();
}

if ("serviceWorker" in navigator && !DEMO) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// ---------- boot ----------
Store.loadLocal();
if (DEMO) { SAMPLES = makeSamples(); S.tasks = SAMPLES; S.activeId = "x6"; S.started = true; }
else if (S.tasks.size) S.started = true;
if (!["focus", "short", "long"].includes(T.mode)) T.mode = "focus";
if (!T.saved || typeof T.saved !== "object") T.saved = {};
if (!T.adj || typeof T.adj !== "object") T.adj = {};
arm();
if (T.status === "running" && Date.now() >= T.endsAt) complete(T.endsAt);
if (T.status === "running") addEventListener("pointerdown", () => { if (T.status === "running" && !pending.length) scheduleEnd(); }, { once: true });
setZen(false);
const invite = normCode(new URLSearchParams(location.search).get("room") || "");
if (invite) {
  try { history.replaceState(null, "", location.pathname); } catch {}
  if (invite.length === 6 && invite !== RM.code) {
    roomReset();
    openRoom();
  } else if (RM.code) roomConnect();
} else if (RM.code) roomConnect();
if (["today", "upcoming", "later"].includes(ss.get("pl.taskView"))) S.taskView = ss.get("pl.taskView");
renderRoom();
renderAll();
document.documentElement.style.setProperty("--bar-h", $(".bar").offsetHeight + "px");
document.body.classList.toggle("scrolled", scrollY > 4);
sizeTimer();
renderSyncTab();
if (!DEMO) Store.connect().then(() => {
  renderPill();
  if (!new URLSearchParams(location.search).has("synced")) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if (Cloud.email) toast("Signed in as " + Cloud.email + ". This device now stays in sync.");
});
