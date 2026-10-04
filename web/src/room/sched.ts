import { toast } from "../chrome/notice.svelte";
import { localZone, nextSession, readTimes, sessionCode, type Schedule, type Times, type Upcoming } from "../lib/schedule";
import { playSound } from "../sound";
import { ls } from "../state";
import { RM, roomEnter } from "./net";

/** A session you asked to be reminded of; `at` is the session you were last counted in for. */
type Reminder = Times & { id: string; title: string; at: number };
export type Draft = Pick<Schedule, "title" | "rhythm" | "max" | "days" | "from" | "to">;

const CHECK_MS = 15000;
const LATE_MS = 5 * 60000;

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

async function allow() {
  let p = "Notification" in window ? Notification.permission : "denied";
  if (p === "default") { try { p = await Notification.requestPermission(); } catch {} }
  toast(p === "granted" ? "You'll get a notification when it starts." : "You'll get a reminder here while this tab is open.");
}

export const Sched = {
  reminded: (id: string) => list.some((r) => r.id === id),
  owns: (id: string) => !!own[id],

  /** Turns the reminder for a schedule on or off and counts you in or out; returns the new count. */
  async remind(s: Schedule, on: boolean, ask = true) {
    list = list.filter((r) => r.id !== s.id);
    const o = nextSession(s, Date.now());
    if (on) list.push({ id: s.id, title: s.title, tz: s.tz, days: s.days, from: s.from, to: s.to, at: o ? o.start : 0 });
    save();
    if (on && ask) allow();
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
  if (!("Notification" in window) || Notification.permission !== "granted" || (!document.hidden && document.hasFocus())) return;
  try {
    const n = new Notification("Pomodoro Ledger", { body: r.title + " is starting. Click to join.", tag: "pl-session-" + r.id });
    n.onclick = () => { window.focus(); n.close(); if (!RM.code && RM.name) roomEnter(code); else open(); };
  } catch {}
}

/** Reminds you when a session you follow starts, while this tab is open. */
export function watchReminders(open: () => void) {
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
