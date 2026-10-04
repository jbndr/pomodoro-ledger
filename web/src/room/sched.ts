import { toast } from "../chrome/notice.svelte";
import { keyBytes, sameKey } from "../lib/push";
import { localZone, nextSession, readTimes, scheduleOf, sessionCode, type Schedule, type Times, type Upcoming } from "../lib/schedule";
import { playSound } from "../sound";
import { DEMO, ls } from "../state";
import { RM, roomEnter } from "./net";

/** A session you asked to be reminded of; `at` is the session you were last counted in for, `push` the endpoint the lobby has. */
type Reminder = Times & { id: string; title: string; at: number; push?: string };
export type Draft = Pick<Schedule, "title" | "rhythm" | "max" | "days" | "from" | "to">;

const CHECK_MS = 15000;
const LATE_MS = 5 * 60000;
const READY_MS = 10000;
const RESYNC_MS = 5000;

let list = ls.get<Reminder[]>("pl.remind", []).filter((r) => r && typeof r.id === "string" && typeof r.title === "string" && readTimes(r));
const own = ls.get<Record<string, string>>("pl.schedOwn", {});
const cid = ls.get("pl.cid", "") || Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
ls.set("pl.cid", cid);

const save = () => { ls.set("pl.remind", list); ls.set("pl.schedOwn", own); };

async function call(path: string, body: object, method = "POST") {
  const res = await fetch("/api/schedule" + path, { method, body: JSON.stringify(body) });
  if (!res.ok) throw res.status;
  return res.status === 204 ? null : res.json();
}

async function going(id: string, on: boolean): Promise<number | null> {
  try { return (await call("/" + id + "/going", { cid, on })).going; } catch { return null; }
}

let serverKey: Promise<Uint8Array<ArrayBuffer> | null> | null = null;
const pushKey = () => (serverKey ||= fetch("/api/push").then((r) => r.json()).then((b) => (typeof b.key === "string" ? keyBytes(b.key) : null)).catch(() => (serverKey = null)));
const granted = () => "Notification" in window && Notification.permission === "granted";

/** This browser's push subscription for the lobby's key, or null when push isn't set up here or on the server. */
async function subscription() {
  if (DEMO || !granted() || !("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const key = await pushKey();
  if (!key) return null;
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), READY_MS))]);
    if (!reg) return null;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
    return sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  } catch { return null; }
}

async function pushOn(r: Reminder, sub?: PushSubscription | null) {
  sub ||= await subscription();
  if (!sub) return false;
  try { await call("/" + r.id + "/push", { cid, sub: sub.toJSON() }); } catch { return false; }
  if (!list.some((x) => x.id === r.id)) { pushOff(r.id); return false; }
  r.push = sub.endpoint;
  save();
  return true;
}

const pushOff = (id: string) => call("/" + id + "/push", { cid }, "DELETE").catch(() => {});

async function allow(r: Reminder, ask: boolean) {
  let p = "Notification" in window ? Notification.permission : "denied";
  if (ask && p === "default") { try { p = await Notification.requestPermission(); } catch {} }
  const pushed = p === "granted" && (await pushOn(r));
  if (ask) toast(pushed ? "You'll get a notification when it starts." : p === "granted" ? "You'll get a notification while this tab is open." : "You'll get a reminder here while this tab is open.");
}

/** Brings the lobby up to date when this browser's subscription changed or push was turned on after the reminder. */
async function resync() {
  if (!list.length || !granted()) return;
  const sub = await subscription();
  if (sub) for (const r of list) if (r.push !== sub.endpoint) await pushOn(r, sub);
}

export const Sched = {
  reminded: (id: string) => list.some((r) => r.id === id),
  owns: (id: string) => !!own[id],

  /** Turns the reminder for a schedule on or off and counts you in or out; returns the new count. */
  async remind(s: Schedule, on: boolean, ask = true) {
    const was = list.find((r) => r.id === s.id), o = nextSession(s, Date.now());
    list = list.filter((r) => r.id !== s.id);
    const r = on ? { id: s.id, title: s.title, tz: s.tz, days: s.days, from: s.from, to: s.to, at: o ? o.start : 0 } : null;
    if (r) list.push(r);
    save();
    if (r) allow(r, ask);
    else if (was?.push) pushOff(s.id);
    return going(s.id, on);
  },

  /** Throws the HTTP status when the lobby says no. */
  async create(d: Draft): Promise<Schedule> {
    const s = await call("", { ...d, tz: localZone() });
    own[s.id] = s.token;
    await Sched.remind(s, true, false);
    return s;
  },

  async remove(id: string) {
    try { await call("/" + id, { token: own[id] }, "DELETE"); } catch (e) {
      if (e !== 404) { toast("Couldn't remove it. Try again."); return false; }
    }
    delete own[id];
    list = list.filter((r) => r.id !== id);
    save();
    toast("Removed.");
    return true;
  },

  /** Forgets schedules the lobby no longer lists, and counts you in again for the next session of each one you follow. */
  seen(upcoming: Upcoming[], live: string[]) {
    const known = new Set([...upcoming.map((u) => u.id), ...live]);
    list = list.filter((r) => known.has(r.id));
    for (const k of Object.keys(own)) if (!known.has(k)) delete own[k];
    for (const u of upcoming) {
      const r = list.find((x) => x.id === u.id);
      if (r && r.at !== u.start) { r.at = u.start; going(u.id, true); }
    }
    save();
  },
};

function starting(r: Reminder, at: number, open: () => void) {
  const code = sessionCode(r.id, at);
  if (RM.code === code) return;
  playSound("task");
  toast(r.title + " is starting. Join it from Work together.");
  if (!granted() || (!document.hidden && document.hasFocus())) return;
  const opts = { body: r.title + " is starting. Click to join.", tag: "pl-session-" + r.id, data: { code }, icon: "/icons/icon-192.png" };
  const page = () => {
    try {
      const n = new Notification("Pomodoro Ledger", opts);
      n.onclick = () => { window.focus(); n.close(); join(code, open); };
    } catch {}
  };
  // Shown through the service worker when there is one, so it and a push for the same session share one notification.
  const reg = "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined);
  reg.then((sw) => (sw ? sw.showNotification("Pomodoro Ledger", opts) : page())).catch(page);
}

function join(code: string, open: () => void) {
  if (RM.code === code) return;
  if (!RM.code && RM.name) roomEnter(code);
  else open();
}

/** Reminds you when a session you follow starts: here while this tab is open, and through push when it isn't. */
export function watchReminders(open: () => void) {
  navigator.serviceWorker?.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.t === "join" && typeof d.code === "string" && scheduleOf(d.code)) join(d.code, open);
  });
  setTimeout(resync, RESYNC_MS);
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    for (const r of list) {
      const o = nextSession(r, last);
      if (o && o.start > last && o.start <= now && now - o.start < LATE_MS) starting(r, o.start, open);
    }
    last = now;
  }, CHECK_MS);
}
