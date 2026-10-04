import { addDays, dayKey, keyTime, nextMonday, sod } from "./lib/dates";
import { flushSync, mount } from "svelte";
import TaskList from "./tasks/TaskList.svelte";
import { list, progress } from "./lib/redraw.svelte";
import { cyclesOf, focusTasks, labelHue, matchLabel, matchesLabel, projectNames, projectOf, sessionProject, timeOf } from "./lib/tasks";
import Progress from "./progress/Progress.svelte";
import Settings from "./settings/Settings.svelte";
import TimerCard from "./timer/TimerCard.svelte";
import { timerView } from "./timer/state.svelte";
import { clock, MODE_NAME } from "./lib/timer";
import Composer from "./composer/Composer.svelte";
import { composer } from "./composer/state.svelte";
import LabelPop from "./popovers/LabelPop.svelte";
import Pop from "./popovers/Pop.svelte";
import WhenPop from "./popovers/WhenPop.svelte";
import { LP, labelPop, pop, whenPop } from "./popovers/state.svelte";
import { pill, room, roomClock } from "./lib/redraw.svelte";
import { normCode } from "./lib/room";
import { toast } from "./chrome/notice.svelte";
import BarTools from "./chrome/BarTools.svelte";
import Keys from "./chrome/Keys.svelte";
import Tip from "./chrome/Tip.svelte";
import Toast from "./chrome/Toast.svelte";
import RoomDialog from "./room/RoomDialog.svelte";
import RoomStrip from "./room/RoomStrip.svelte";

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
  confirmDel: null,
  subtaskDrafts: new Map(), openTask: null, taskView: "today", projectFilter: "", labels: [], newLabel: "",
};
let taskList = null;
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
// Skipping keeps the clock going if it was running.
function skip() { const run = T.status === "running"; flushPartial(); setMode(T.mode === "focus" ? "short" : "focus"); if (run) start(); }

// ---------- rendering: timer ----------
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
let lastTxt = "";
function renderTimer(force) {
  if (force) syncTicking();
  document.body.dataset.mode = T.mode;
  if (document.body.dataset.status !== T.status) document.body.dataset.status = T.status;
  const total = totalNow(), rem = remNow(), frac = Math.max(0, Math.min(1, rem / total));
  const txt = clock(Math.ceil(rem / 1000));
  if (txt !== lastTxt || force) {
    lastTxt = txt;
    document.title = T.status === "idle" ? "Pomodoro Ledger" : txt + " · " + MODE_NAME[T.mode] + (T.status === "paused" ? " (paused)" : "");
  }
  timerView.set(rem, total);
  renderFloating(txt, frac);
  renderTaskStarts(force);
  const tabTime = T.status === "running" ? txt : "Timer";
  if ($("#tabTime").textContent !== tabTime) $("#tabTime").textContent = tabTime;
  if (!force) return;
  roomPush();
  timerView.refresh();
}

// ---------- popovers: floating menu, When and label picker ----------
let popUI = null, whenUI = null, labelUI = null;
function openPop(anchor, items, cur, cb) { popUI.open(anchor, items, cur, cb); }
function closePop(refocus) { popUI?.close(refocus); }
function openWhen(anchor, t, onPick) { whenUI.open(anchor, t, onPick); }
function closeWhen(refocus) { whenUI?.close(refocus); }
function openLabelPop(key, find, value, cb) { labelUI.open(key, find, value, cb); }
function closeLabelPop(refocus) { labelUI?.close(refocus); }
function refreshLabelPop() { labelUI?.refresh(); }
function placeLabelPop() { labelUI?.place(); }
function labelAnchor() { return labelUI ? labelUI.anchor() : null; }

// ---------- reordering ----------
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function commitPlacements(order) {
  const changed = [];
  for (const p of order) {
    const t = S.tasks.get(p.id);
    if (!t) continue;
    const n = placed(t, p.end && t.plan >= p.g && t.plan <= p.end ? t.plan : p.g, p.order);
    if (t.order !== p.order || !!t.today !== n.today || (t.plan || "") !== (n.plan || "") || (t.section || "") !== (n.section || "")) changed.push(n);
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
// ---------- full screen ----------
function setZen(on) {
  document.body.classList.toggle("zen", on);
  document.querySelectorAll(".bar, .room, .banner, .panel, .progress, .tabbar").forEach((el) => (el.inert = on));
  timerView.zen = on;
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
const labelDot = (name) => '<i class="label-dot" style="--h:' + labelHue(name) + '"></i>';
const labelChipName = (name) => name ? "Label: " + name + ". Change label" : "Add a label";

const subsOf = (t) => (Array.isArray(t.subtasks) ? t.subtasks : []);
const subOpen = (t) => S.openTask === t.id;
let startEstimateMinute = -1, renderedDay = "";
const completing = new Map();
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
  if (taskList && taskList.dragging()) return;
  if (renderedDay !== todayKey()) { renderTasks(); return; }
  const minute = Math.floor(Date.now() / MIN);
  if (!force && minute === startEstimateMinute) return;
  startEstimateMinute = minute;
  const plan = taskStartPlan();
  list.setPlan(plan);
  const fit = $("#dayFit"), ids = plan.over ? plan.rest : plan.late;
  fit.hidden = S.taskView !== "today" || !ids.length || preview();
  fit.classList.toggle("over", plan.over);
  if (!fit.hidden) {
    fit.dataset.ids = ids.join(",");
    $("#dayFitText").textContent = plan.over ? "Your workday ended at " + fmtClock(plan.endAt) + ". Done for today?" : plural(ids.length, "task") + " won't fit before " + fmtClock(plan.endAt) + ".";
    $("#dayFitMove").textContent = plan.over ? "Move the rest to tomorrow" : "Move to tomorrow";
  }
}
function renderTasks() {
  if (taskList && taskList.dragging()) return;
  renderedDay = todayKey();
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
  if (!open.length) {
    $("#taskFoot").innerHTML = S.projectFilter ? '<div class="empty"><strong>No open tasks with this label</strong><span>Choose “All” to see the rest of your ledger.</span></div>' : '<div class="empty"><strong>No open tasks</strong><span>Add one above and estimate how many 25-minute cycles it needs. Then pick it under “Working on” and press Start.</span></div>';
  } else {
    const shown = byView[S.taskView];
    const empty = { today: ["Nothing planned for today", "Press D on a task, or use its calendar button, to bring it here."], upcoming: ["", ""], later: ["Nothing in Later", "Tasks without a day land here."] }[S.taskView];
    $("#taskFoot").innerHTML = (shown.length || !empty[0] ? "" : '<div class="empty"><strong>' + empty[0] + "</strong><span>" + empty[1] + "</span></div>") +
      (doneN ? '<div class="finished-note">' + plural(doneN, "finished task") + ' with cycles and time are in the <a href="#ledger">ledger below</a>.</div>' : "");
  }
  list.refresh();
  renderTaskStarts(true);
  flushSync();
  if (!labelPop.hidden) {
    const a = labelAnchor();
    if (a) { if (LP.key !== "hash") a.setAttribute("aria-expanded", "true"); placeLabelPop(); } else closeLabelPop();
  }
}

// ---------- rendering: stats ----------
function renderStats() { progress.refresh(); }
function renderPill() {
  pill.refresh();
  $("#previewBanner").hidden = !preview();
  $("#previewBanner span").innerHTML = DEMO
    ? "<strong>Interactive demo.</strong> Changes reset when you reload and never affect your saved ledger."
    : "<strong>You're looking at example data.</strong> Add your first task or start the timer, and the examples disappear.";
  $("#startOwn").textContent = DEMO ? "Exit demo" : "Start my own ledger";
}
function renderEstPick() { composer.refresh(); }
function renderAll() { renderPill(); renderTasks(); renderStats(); renderEstPick(); renderTimer(true); }

// ---------- events ----------
const guardPreview = () => { if (preview() && !DEMO) { toast("These are examples. Add a task to start your own ledger."); return true; } return false; };
$("#startOwn").addEventListener("click", () => {
  if (DEMO) {
    const url = new URL(location.href);
    url.searchParams.delete("demo");
    location.assign(url.pathname + url.search + url.hash);
    return;
  }
  markStarted(); $("#newTitle").focus();
});
const filterLabel = () => (S.projectFilter.startsWith("project:") ? S.projectFilter.slice(8) : "");
function renderNewLabel() { composer.refresh(); }
const newTitle = { get value() { return $("#newTitle")?.value ?? ""; } };
function addTask(title, est, into, notes) {
  markStarted(true);
  const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const last = Math.max(-1, ...openOf(S.tasks).filter((x) => inGroup(x, into)).map(ord));
  const t = placed({ id, title, est, done: false, createdAt: Date.now(), doneAt: null, sessions: [], subtasks: [], ...(notes ? { notes } : {}) }, into, last + 1);
  if (S.newLabel) t.project = Labels.use(S.newLabel);
  if (!S.activeId || !S.tasks.get(S.activeId) || S.tasks.get(S.activeId).done) { S.activeId = id; saveTimer(); }
  if (!inProject(t)) S.projectFilter = "";
  Store.saveTask(t);
  toast("Added “" + title + "”" + (t.project ? " to " + t.project : "") + " · " + (into === "later" ? "Later" : dayName(into === "today" ? todayKey() : into)) + ".");
}
function focusAddSubtask(id) {
  [...$("#taskList").querySelectorAll(".task")].find((el) => el.dataset.id === id)?.querySelector(".subtask-add input")?.focus();
}
function addSubtasks(id, titles) {
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t);
  n.subtasks = [...(n.subtasks || []), ...titles.map((title) => ({ id: crypto.randomUUID(), title: title.slice(0, 140), done: false }))];
  S.subtaskDrafts.delete(id);
  Store.saveTask(n);
}
function editSubtask(id, subid, edit) {
  if (guardPreview()) return;
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t), sub = (n.subtasks || []).find((s) => s.id === subid);
  if (!sub) return;
  edit(sub);
  Store.saveTask(n);
}
function renameSubtask(id, subid, input) {
  const t = S.tasks.get(id), sub = t && subsOf(t).find((s) => s.id === subid), title = input.value.trim();
  if (!sub) return;
  if (!title) { input.value = sub.title; return; }
  if (title !== sub.title) editSubtask(id, subid, (s) => { s.title = title; });
}
function deleteSubtask(id, subid) {
  if (guardPreview()) return;
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t);
  n.subtasks = (n.subtasks || []).filter((s) => s.id !== subid);
  Store.saveTask(n);
  focusAddSubtask(id);
}
$("#projectFilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  S.projectFilter = b.dataset.filter;
  if (!newTitle.value.trim()) { S.newLabel = filterLabel(); renderNewLabel(); }
  renderTasks();
  $('#projectFilter [aria-pressed="true"]')?.focus();
});
function saveSections(next) { S.settings.sections = next; Store.saveSettings(); renderTasks(); }
function moveSection(id, to) {
  const all = sections(), from = all.findIndex((x) => x.id === id);
  if (from < 0 || to < 0 || to >= all.length || to === from) return false;
  const next = [...all]; next.splice(to, 0, next.splice(from, 1)[0]);
  saveSections(next);
  return true;
}
function renameSection(input) {
  const all = sections(), sec = all.find((x) => x.id === input.dataset.sec), title = input.value.trim();
  if (!sec) return;
  if (!title) { input.value = sec.title; return; }
  if (title !== sec.title) saveSections(all.map((x) => (x === sec ? { ...x, title } : x)));
}
function addSection() {
  if (guardPreview()) return;
  const id = "s" + Date.now().toString(36);
  saveSections([...sections(), { id, title: "New section" }]);
  const input = $('#taskList [data-sec="' + id + '"]');
  if (input) { input.focus(); input.select(); }
}
function removeSection(id) {
  if (guardPreview()) return;
  const sec = sections().find((x) => x.id === id);
  saveSections(sections().filter((x) => x !== sec));
  if (sec) toast("Removed “" + sec.title + "”. Its tasks stay in Today.");
}
function completeTask(id) {
  if (guardPreview()) return;
  // A short pause before the task leaves, so a slipped click can be taken back.
  if (completing.has(id)) { clearTimeout(completing.get(id)); completing.delete(id); renderTasks(); return; }
  if (!S.tasks.get(id)) return;
  playSound("task");
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
  renderTasks();
}
function focusOnTask(id) {
  if (guardPreview() || !S.tasks.get(id)) return;
  S.activeId = id; saveTimer(); renderTasks();
  if (T.mode !== "focus") setMode("focus", true);
  if (T.status !== "running") start();
  if (phone()) showPage("timer");
}
function labelTask(id) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const find = () => [...$("#taskList").querySelectorAll(".task")].find((el) => el.dataset.id === id)?.querySelector("[data-act='label']");
  openLabelPop("row:" + id, find, projectOf(t), (name) => {
    const cur = S.tasks.get(id);
    if (!cur || name === projectOf(cur)) return;
    const n = clone(cur);
    if (name) n.project = Labels.use(name); else delete n.project;
    Store.saveTask(n);
    find()?.focus();
  });
}
function schedTask(anchor, id) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  if (!whenPop.hidden) { closeWhen(); return; }
  openWhen(anchor, t);
}
let delTimer = null;
function deleteTask(id) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  clearTimeout(delTimer);
  if (S.confirmDel === id) { S.confirmDel = null; if (S.openTask === id) S.openTask = null; if (S.activeId === id) { S.activeId = null; saveTimer(); } Store.deleteTask(id); toast("Deleted “" + t.title + "”."); }
  else { S.confirmDel = id; renderTasks(); delTimer = setTimeout(() => { S.confirmDel = null; renderTasks(); }, 3000); }
}
function setEstimate(id, est) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t || (t.est || 0) === est) return;
  const n = clone(t); n.est = est; Store.saveTask(n);
}
function focusRow(li) {
  if (!li) return;
  if (phone() && document.body.dataset.page !== "tasks") showPage("tasks");
  li.focus({ preventScroll: true });
  li.scrollIntoView({ block: "nearest" });
}
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
document.addEventListener("pointerdown", (e) => {
  if (!S.openTask || e.target.closest(".task.open, #whenPop, #labelPop, #pop, .toast")) return;
  const el = document.activeElement; if (el && el.matches && el.matches("[data-field]")) saveField(el);
  S.openTask = null; S.confirmDel = null; renderTasks();
});
function quickDays() {
  const now = Date.now();
  return { today: "today", tomorrow: dayKey(addDays(now, 1)), week: nextMonday(now), later: "later" };
}

// ---------- scheduling shortcuts ----------
// They act on the task under the mouse or keyboard focus, else the one you're working on.
let hoverTask = "";
function shortcutTask() {
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest("#taskList .task");
  const id = focused ? focused.dataset.id : hoverTask || S.activeId;
  const t = id && S.tasks.get(id);
  return t && !t.done && !t.system ? t : null;
}
// ⌥↑/⌥↓ move a task one place (past a heading counts as a step); with ⇧ it jumps a whole section, or a day in Upcoming.
function moveTaskKey(up, far) {
  const t = shortcutTask();
  if (!t) { toast("Point at a task or pick one to work on first."); return; }
  if (guardPreview()) return;
  if (S.projectFilter) { toast("Show all tasks to reorder."); return; }
  const moved = taskList.moveTask(t.id, up, far);
  if (!moved) return;
  if (moved.to !== moved.from) toast("Moved “" + t.title + "” to " + groupName(moved.to) + ".");
  focusRow([...$("#taskList").querySelectorAll(".task")].find((x) => x.dataset.id === t.id));
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
function reopenTask(id) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const n = clone(t); n.done = false; n.doneAt = null;
  Store.saveTask(n);
  toast("Moved “" + t.title + "” back to open tasks.");
}
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
let settingsUI = null;
function fillSettings() { settingsUI.fill(); }
function openSettings(tab) { settingsUI.open(tab); }
function closeSettings() { settingsUI.close(); }
function renderSyncTab() { settingsUI.renderSync(); }
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
let keysSheet = null;
function openKeys() { keysSheet.open(); }
function closeKeys() { keysSheet.close(); }
$("#openSettings").addEventListener("click", () => openSettings());

// ---------- shared room ----------
const ss = {
  get(k) { if (DEMO) return null; try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { if (DEMO) return; try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} },
};
const RM = { owner: false, ws: null, code: ss.get("pl.room"), id: ss.get("pl.rid"), name: ls.get("pl.name", ""), you: null, members: [], prop: null, live: false, tries: 0, timer: null, ping: null, sent: "" };
if (!RM.id) { RM.id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); ss.set("pl.rid", RM.id); }
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
async function roomCreate() {
  const res = await fetch("/api/room", { method: "POST" }), body = res.ok ? await res.json() : null;
  if (!body || !body.code) throw 0;
  ss.set("pl.owner." + body.code, body.ownerToken);
  roomEnter(body.code);
}
let roomDialog = null;
// Synchronous like the markup it replaced: a focused field in the dialog has to hide and disable in one go, or Chrome moves focus elsewhere.
function renderRoom() { room.refresh(); flushSync(); }
function roomTick() { roomClock.refresh(); }
function openRoom() { roomDialog.open(); }
function closeRoom() { roomDialog.close(); }

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
[$(".bar"), $("#previewBanner")].forEach((el) => timerLayout.observe(el));
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
if (["today", "upcoming", "later"].includes(ss.get("pl.taskView"))) S.taskView = ss.get("pl.taskView");
mount(Progress, { target: $(".app"), props: { api: {
  S, ICON, esc, viewTasks, labelHidden, guardPreview, fmtDur, fmtDate, fmtClock, plural,
  deleteSession, labelSession, moveSession, moveItems, openLabelPop, openPop, closePop, popHidden: () => pop.hidden, reopen: reopenTask,
} } });
const roomApi = { RM, ls, invite, setOverlay, sizeTimer, roomSend, roomReset, roomEnter, roomCreate };
mount(BarTools, { target: $(".bar-right"), anchor: $(".bar-right").firstChild, props: { api: {
  RM, ls, S, Cloud, DEMO, preview, openRoom, openKeys,
  openSync: () => { if (!DEMO) openSettings("sync"); },
  themed: () => { if (floatWindow && !floatWindow.closed) renderFloating(lastTxt, 0); },
} } });
mount(RoomStrip, { target: $(".app"), anchor: $(".bar").nextSibling, props: { api: roomApi } });
timerLayout.observe($("#roomStrip"));
mount(Tip, { target: document.body });
mount(Toast, { target: document.body });
roomDialog = mount(RoomDialog, { target: document.body, props: { api: roomApi } });
keysSheet = mount(Keys, { target: document.body, props: { api: { setOverlay } } });
if (invite) {
  try { history.replaceState(null, "", location.pathname); } catch {}
  if (invite.length === 6 && invite !== RM.code) {
    roomReset();
    openRoom();
  } else if (RM.code) roomConnect();
} else if (RM.code) roomConnect();
settingsUI = mount(Settings, { target: document.body, props: { api: {
  S, Store, Cloud, ls, toast, setOverlay, floatable: !floatBtn.hidden, get T() { return T; },
  ensureAudio, playSound, scheduleEnd, cancelEnd, cancelTickPreview, syncTicking, previewTicking: () => { tickPreview = tickingNode(6); },
  autoFloatHandler, renderTimer, renderStats, renderEstPick,
} } });
mount(TimerCard, { target: $(".timer-card"), props: { api: {
  get T() { return T; }, S, ICON, floatBtn, fmtClock, fmtDur, plural, viewTasks, openOf,
  toggle, skip, adjust, setMode, flushPartial, buzz, toggleZen,
  setActive: (id) => { if (preview()) { markStarted(); return; } S.activeId = id || null; saveTimer(); renderTasks(); },
} } });
timerLayout.observe($(".working"));
popUI = mount(Pop, { target: document.body, anchor: $("#toast"), props: { api: { ICON } } });
whenUI = mount(WhenPop, { target: document.body, anchor: $("#toast"), props: { api: { S, todayKey, openOf, isToday, scheduleTask, fmtDate, plural } } });
labelUI = mount(LabelPop, { target: document.body, anchor: $("#toast"), props: { api: { S, ICON, renderTasks, saveSettings: () => Store.saveSettings() } } });
mount(Composer, { target: $("#projectFilter").parentNode, anchor: $("#projectFilter"), props: { api: {
  S, ICON, plural, dayName, todayKey, dur, fmtDur, labelChipName, filterLabel, addTask,
  openWhen, openLabelPop, closeLabelPop, labelKey: (e) => labelUI.key(e), filterLabels: (q) => labelUI.filter(q),
} } });
taskList = mount(TaskList, { target: $("#taskFoot").parentNode, anchor: $("#taskFoot"), props: { api: {
  S, ICON, completing, calm, guardPreview,
  todayKey, bucketOf, isToday, sections, openOf, viewTasks, inProject, cyclesOf, timeOf, projectOf, labelHue, labelChipName, subsOf,
  plural, fmtDur, fmtDate, fmtClock, shortDay, dayName, keyTime, dayKey, addDays, sod, dur, groupName,
  renderTasks, commit: commitPlacements, focusRow, hover: (id) => { hoverTask = id; },
  open: toggleCard, complete: completeTask, focus: focusOnTask, label: labelTask, sched: schedTask, del: deleteTask, setEst: setEstimate,
  saveField, addSubtasks, subDone: (id, subid, done) => editSubtask(id, subid, (s) => { s.done = done; }), renameSub: renameSubtask, deleteSub: deleteSubtask,
  addSection, removeSection, renameSection, moveSection,
} } });
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
