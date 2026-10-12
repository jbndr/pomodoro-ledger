import { toast } from "../chrome/notice.svelte";
import { isCrewCode, isCrewRoom, type CrewMate, type CrewWeek } from "../lib/crew";
import { room } from "../lib/redraw.svelte";
import { localZone, nextSession, type Times } from "../lib/schedule";
import { playSound } from "../sound";
import { DEMO, ls, T } from "../state";
import { remNow, totalNow } from "../timer/engine";
import { RM, roomEnter, setHelloExtra } from "./net";
import { clientId, pushSubscription } from "./sched";

export type CrewInfo = { name: string; room: string; tz: string; slot: Times | null };

const CHECK_MS = 15000;
const LATE_MS = 5 * 60000;

export const CR = {
  code: ls.get<string>("pl.crew", ""), ws: null as WebSocket | null, live: false, tries: 0,
  you: null as string | null, crew: null as CrewInfo | null, members: [] as CrewMate[], week: null as CrewWeek | null, hide: false,
  remind: ls.get<boolean>("pl.crewRemind", false), sent: "", joining: false,
  timer: undefined as ReturnType<typeof setTimeout> | undefined, ping: undefined as ReturnType<typeof setInterval> | undefined,
};

// A link with ?crews=1 or a crew invite turns crews on for this browser while they're new.
const asked = new URLSearchParams(location.search);
if (asked.get("crews") === "1" || isCrewCode((asked.get("crew") || "").toUpperCase())) ls.set("pl.crews", true);
setHelloExtra(() => (CR.code && isCrewRoom(RM.code || "") ? { cid: clientId(), crew: CR.code } : {}));

export const crewsOn = () => !DEMO && (ls.get<boolean>("pl.crews", false) || !!CR.code);

const send = (o: object) => { try { if (CR.ws && CR.ws.readyState === 1) CR.ws.send(JSON.stringify(o)); } catch {} };
const redraw = () => room.refresh();

export function crewPush(force?: boolean) {
  if (!CR.live) return;
  const total = Math.round(totalNow()), key = [T.mode, T.status, T.status === "running" ? T.endsAt : Math.round(remNow()), total].join("|");
  if (key === CR.sent && !force) return;
  CR.sent = key;
  send({ t: "state", s: { mode: T.mode, status: T.status, remaining: Math.round(remNow()), total } });
}

function forget(note?: string) {
  clearTimeout(CR.timer); clearInterval(CR.ping);
  const ws = CR.ws;
  Object.assign(CR, { code: "", ws: null, live: false, tries: 0, you: null, crew: null, members: [], week: null, hide: false, sent: "", joining: false, remind: false });
  ls.set("pl.crew", ""); ls.set("pl.crewRemind", false);
  if (ws) try { ws.close(1000); } catch {}
  if (note) toast(note);
  redraw();
}

const socketTo = (code: string) => new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/crew/" + code + "/ws");

export function crewConnect() {
  clearTimeout(CR.timer);
  // Another tab may have left this crew or joined another since this one loaded.
  const stored = ls.get<string>("pl.crew", "");
  if (CR.code && stored !== CR.code && !CR.joining) { if (stored) CR.code = stored; else { forget(); return; } }
  if (!CR.code || !RM.name || CR.ws) return;
  let ws: WebSocket;
  try { ws = socketTo(CR.code); } catch { return; }
  CR.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: "hello", cid: clientId(), name: RM.name, join: CR.joining }));
  ws.onmessage = (e) => {
    if (ws !== CR.ws || e.data === "pong") return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m || m.t !== "crew") return;
    const skew = Date.now() - m.now;
    CR.you = m.you; CR.crew = m.crew; CR.week = m.week; CR.hide = !!m.hide;
    CR.members = m.members.map((x: CrewMate) => ({ ...x, s: x.s && { ...x.s, end: x.s.end ? x.s.end + skew : 0 } }));
    if (!CR.live) {
      CR.live = true; CR.tries = 0; CR.joining = false;
      clearInterval(CR.ping); CR.ping = setInterval(() => { try { CR.ws && CR.ws.send("ping"); } catch {} }, 25000);
      crewPush(true);
      if (CR.remind) subscribe();
    }
    redraw();
  };
  ws.onclose = (e) => {
    if (ws !== CR.ws) return;
    const was = CR.live;
    CR.ws = null; CR.live = false; clearInterval(CR.ping);
    const gone = ({ 4004: "That crew doesn't exist anymore.", 4003: "That crew is full. A crew has room for eight.", 4007: "", 4000: "Couldn't join that crew." } as Record<number, string>)[e.code];
    if (gone !== undefined) { forget(gone || undefined); return; }
    if (!was && ++CR.tries > 5) { redraw(); return; }
    CR.timer = setTimeout(crewConnect, Math.min(30000, 1000 * 2 ** CR.tries));
    redraw();
  };
}

/** Says hello again, so a new name reaches the crew. */
export function crewRehello() {
  if (!CR.code) return;
  const ws = CR.ws;
  CR.ws = null; CR.live = false; clearInterval(CR.ping);
  if (ws) try { ws.close(1000); } catch {}
  crewConnect();
}

/** Starts a crew with you in it; throws when the Worker says no. */
export async function crewCreate(name: string) {
  const res = await fetch("/api/crew", { method: "POST", body: JSON.stringify({ name, tz: localZone() }) });
  if (!res.ok) throw res.status;
  crewJoin((await res.json()).code);
}

export function crewJoin(code: string) {
  if (CR.code && CR.code !== code) crewLeave(true);
  CR.code = code; CR.tries = 0; CR.joining = true;
  ls.set("pl.crew", code); ls.set("pl.crews", true);
  crewConnect();
  redraw();
}

// Without a live connection, leaving opens one just for that, so you're never left in a crew by accident.
export function crewLeave(quiet = false) {
  if (CR.ws && CR.ws.readyState === 1) send({ t: "leave" });
  else if (CR.code && RM.name) {
    try {
      const ws = socketTo(CR.code);
      ws.onopen = () => { ws.send(JSON.stringify({ t: "hello", cid: clientId(), name: RM.name })); ws.send(JSON.stringify({ t: "leave" })); };
      setTimeout(() => { try { ws.close(); } catch {} }, 10000);
    } catch {}
  }
  forget(quiet ? undefined : "You left the crew.");
}

export async function crewInfo(code: string): Promise<{ name: string; size: number; max: number; slot: Times | null } | null> {
  try { const res = await fetch("/api/crew/" + code, { cache: "no-store" }); return res.ok ? await res.json() : null; } catch { return null; }
}

export const crewRename = (name: string) => send({ t: "name", name });
export const crewSlot = (slot: Times | null) => send({ t: "slot", slot });

/** Hidden, the crew sees you as away; you still see them, and your rounds still count. */
export function crewHide(on: boolean) {
  if (!CR.live) return;
  CR.hide = on;
  send({ t: "hide", on });
  redraw();
}
export const crewLink = () => location.origin + "/app/?crew=" + CR.code;

export function copyCrewInvite() {
  const done = () => toast("Crew invite link copied."), fail = () => toast("Share this link: " + crewLink());
  try { navigator.clipboard.writeText(crewLink()).then(done, fail); } catch { fail(); }
}

/** Opens the crew's room, which stays the same for good. */
export function crewRoom() {
  if (!CR.crew || RM.code === CR.crew.room) return;
  roomEnter(CR.crew.room);
}

const pushBodyOf = (sub?: PushSubscription | null) => JSON.stringify({ cid: clientId(), sub: sub && sub.toJSON() });

/** Hands the crew this browser's push subscription; returns whether it took it. */
async function subscribe() {
  const sub = "Notification" in window && Notification.permission === "granted" ? await pushSubscription() : null;
  return !!sub && fetch("/api/crew/" + CR.code + "/push", { method: "POST", body: pushBodyOf(sub) }).then((r) => r.ok, () => false);
}

/** Turns the crew-time reminder on or off; with notifications allowed it also arrives with the app closed. */
export async function crewRemind(on: boolean) {
  CR.remind = on; ls.set("pl.crewRemind", on);
  redraw();
  if (!on) { fetch("/api/crew/" + CR.code + "/push", { method: "DELETE", body: pushBodyOf() }).catch(() => {}); return; }
  if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch {} }
  toast((await subscribe()) ? "You'll get a notification when crew time starts." : "You'll get a reminder here while the app is open.");
}

/** A nudge when crew time starts and this tab is open. */
export function watchCrew() {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now(), slot = CR.crew?.slot;
    if (slot && CR.remind && CR.crew && RM.code !== CR.crew.room) {
      const o = nextSession(slot, last);
      if (o && o.start > last && o.start <= now && now - o.start < LATE_MS) {
        playSound("task");
        toast("It's crew time for " + CR.crew.name + ". Join the crew room from Work together.");
      }
    }
    last = now;
  }, CHECK_MS);
}
