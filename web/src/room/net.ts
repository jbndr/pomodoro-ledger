import { flushSync } from "svelte";
import { toast } from "../chrome/notice.svelte";
import { setOverlay } from "../layout";
import { room, roomClock } from "../lib/redraw.svelte";
import { endedInStep, hhmm, inStep, phaseAt, type Listed, type Rhythm } from "../lib/rhythm";
import { addBubble, liveBubbles, othersOf, REACT_LIFE_MS, REACTIONS, takeToken, tokenIn, type Bubble, type Bucket, type Member, type Mode, type Proposal } from "../lib/room";
import type { Upcoming } from "../lib/schedule";
import type { Status } from "../lib/timer";
import { renderTimer } from "../render";
import { cancelEnd, playSound } from "../sound";
import { ls, S, ss, T } from "../state";
import { flushPartial, notify, remNow, saveTimer, setMode, start, totalNow, wakeOff } from "../timer/engine";

type Shared = { mode: Mode; status: Status; remaining: number; total: number };
export type PublicRoom = { title: string; rhythm: Rhythm; house: boolean; max: number };
type RoomMsg =
  | { t: "note"; msg: string }
  | { t: "sync"; s: Shared; by: string; name: string }
  | { t: "react"; by: string; name: string; e: string }
  | { t: "room"; now: number; you: string; owner?: boolean; members: (Omit<Member, "owner"> & { owner?: boolean })[]; prop: Proposal | null; pub?: PublicRoom | null };

export const RM = {
  owner: false, ws: null as WebSocket | null, code: ss.get("pl.room"), id: ss.get("pl.rid"), name: ls.get("pl.name", ""),
  you: null as string | null, members: [] as Member[], prop: null as Proposal | null, live: false, tries: 0,
  pub: readPub(), fresh: false,
  bubbles: [] as Bubble[], bucket: null as Bucket | null, cheerUntil: 0,
  /** Reactions rising from the face of whoever sent them. */
  floats: [] as { key: number; e: string; by: string }[],
  /** How far this device's clock is ahead of the server's. */
  skew: 0,
  timer: undefined as ReturnType<typeof setTimeout> | undefined, fade: undefined as ReturnType<typeof setTimeout> | undefined, ping: undefined as ReturnType<typeof setInterval> | undefined, sent: "",
};
function readPub(): PublicRoom | null { try { return JSON.parse(ss.get("pl.roomPub") || "null"); } catch { return null; } }

if (!RM.id) { RM.id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); ss.set("pl.rid", RM.id); }

export const roomSend = (o: object) => { try { if (RM.ws && RM.ws.readyState === 1) RM.ws.send(JSON.stringify(o)); } catch {} };

export function roomPush(force?: boolean) {
  if (!RM.live) return;
  const total = Math.round(totalNow()), key = [T.mode, T.status, T.status === "running" ? T.endsAt : Math.round(remNow()), total].join("|");
  if (key === RM.sent && !force) return;
  RM.sent = key;
  roomSend({ t: "state", s: { mode: T.mode, status: T.status, remaining: Math.round(remNow()), total } });
}

export function roomReset() {
  clearTimeout(RM.timer); clearInterval(RM.ping);
  const ws = RM.ws;
  RM.owner = false; RM.ws = null; RM.code = null; RM.live = false; RM.members = []; RM.prop = null; RM.tries = 0; RM.pub = null; RM.fresh = false;
  RM.bubbles = []; RM.floats = []; RM.cheerUntil = 0; clearTimeout(RM.fade);
  ss.set("pl.room", null); ss.set("pl.roomPub", null);
  if (ws) try { ws.close(1000); } catch {}
  renderRoom();
}

export function roomConnect() {
  clearTimeout(RM.timer);
  if (!RM.code) return;
  let ws: WebSocket;
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
    const gone = ({ 4005: "The room creator removed you from the room.", 4000: "Couldn't join that room.", 4001: "This room was opened in another tab.", 4003: "That room is full.", 4004: "That room doesn't exist, or it has already closed." } as Record<number, string>)[e.code];
    if (gone || (!was && ++RM.tries > 3)) { roomReset(); toast(gone || "Couldn't reach the room. Check your connection and try again."); return; }
    RM.timer = setTimeout(roomConnect, Math.min(15000, 1000 * 2 ** RM.tries));
    renderRoom();
  };
}

function roomMsg(m: RoomMsg) {
  if (m.t === "note") toast(m.msg);
  else if (m.t === "sync") applySync(m);
  else if (m.t === "react") { if (reactionsOn() && REACTIONS.includes(m.e)) bubble(m.e, m.name, m.by); }
  else if (m.t === "room") {
    const skew = Date.now() - m.now, had = RM.prop;
    RM.skew = skew;
    RM.you = m.you; RM.owner = !!m.owner;
    RM.members = m.members.map((x) => ({ id: x.id, name: x.name, owner: !!x.owner, s: x.s && { ...x.s, end: x.s.end ? x.s.end + skew : 0 } }));
    RM.prop = m.prop;
    RM.pub = m.pub || null;
    ss.set("pl.roomPub", RM.pub && JSON.stringify(RM.pub));
    if (!RM.live) {
      RM.live = true; RM.tries = 0;
      clearInterval(RM.ping); RM.ping = setInterval(() => { try { RM.ws && RM.ws.send("ping"); } catch {} }, 25000);
      if (RM.fresh && RM.pub) followRoom(true);
      RM.fresh = false;
      roomPush(true);
    }
    if (RM.prop && !had && RM.prop.by !== RM.you) { playSound("task"); notify("Someone in your room wants to sync timers."); }
    renderRoom();
  }
}

/** Jumps the current phase to `remaining`, keeping the time already done in it. */
function snap(remaining: number, running: boolean) {
  const done = T.status === "idle" ? 0 : (T.total || 0) - remNow();
  cancelEnd();
  delete T.adj[T.mode];
  T.total = done + remaining; T.remaining = remaining; T.endsAt = 0; T.status = "paused";
  if (running) start(); else { wakeOff(); saveTimer(); renderTimer(true); }
}

function applySync(m: Extract<RoomMsg, { t: "sync" }>) {
  const s = m.s;
  if (m.by === RM.you && T.status !== "idle") { toast("Everyone accepted. Your timers are in sync."); return; }
  if (T.mode !== s.mode) setMode(s.mode, true);
  snap(s.remaining, s.status === "running");
  toast(m.by === RM.you ? "Everyone accepted. Starting together." : "Synced to " + m.name + "'s timer.");
}

/** Puts this timer on the public room's clock. */
export function followRoom(announce?: boolean) {
  if (!RM.pub) return;
  const now = Date.now() - RM.skew, p = phaseAt(RM.pub.rhythm, now), mode: Mode = p.focus ? "focus" : "short";
  if (T.mode !== mode) { flushPartial(); setMode(mode); }
  snap(p.end - now, true);
  if (announce) toast((p.focus ? "Focusing with " : "On a break with ") + RM.pub.title + " until " + hhmm(p.end + RM.skew) + ".");
}

/** Whether a phase that just ended was on the room clock, so the next one should be too. */
export const roomFollows = (at: number) => !!(RM.code && RM.pub && endedInStep(RM.pub.rhythm, T.mode, at - RM.skew));

export const roomInStep = () => !!RM.pub && inStep(RM.pub.rhythm, { ...T, endsAt: T.endsAt - RM.skew }, Date.now() - RM.skew);

export function roomEnter(code: string) {
  RM.code = code; RM.tries = 0; RM.fresh = true; ss.set("pl.room", code);
  setOverlay("#room", false);
  renderRoom(); roomConnect();
}

export async function roomCreate(pub?: { title: string; rhythm: Rhythm; max: number }) {
  const res = await fetch("/api/room", { method: "POST", body: pub ? JSON.stringify({ pub: true, ...pub }) : undefined }), body = res.ok ? await res.json() : null;
  if (!body || !body.code) throw 0;
  ss.set("pl.owner." + body.code, body.ownerToken);
  roomEnter(body.code);
}

export async function roomList(): Promise<{ now: number; rooms: Listed[]; upcoming?: Upcoming[] }> {
  const res = await fetch("/api/rooms", { cache: "no-store" });
  if (!res.ok) throw new Error("rooms " + res.status);
  return res.json();
}

export const reactionsOn = () => S.settings.reactions !== false;

let floatKey = 0;
const FLOAT_MS = 1400;

function bubble(e: string, name: string, by: string | null) {
  RM.bubbles = addBubble(RM.bubbles, e, name, Date.now());
  if (by) {
    const key = ++floatKey;
    RM.floats = [...RM.floats, { key, e, by }];
    setTimeout(() => { RM.floats = RM.floats.filter((f) => f.key !== key); renderRoom(); }, FLOAT_MS);
  }
  fadeBubbles();
}

function fadeBubbles() {
  clearTimeout(RM.fade);
  renderRoom();
  if (!RM.bubbles.length) return;
  const next = Math.min(...RM.bubbles.map((b) => b.at + REACT_LIFE_MS)) - Date.now();
  RM.fade = setTimeout(() => { RM.bubbles = liveBubbles(RM.bubbles, Date.now()); fadeBubbles(); }, Math.max(0, next) + 20);
}

/** Sends a reaction unless this device is sending them too quickly; returns whether it went out. */
export function roomReact(e: string) {
  const b = takeToken(RM.bucket, Date.now());
  if (!RM.live || !reactionsOn() || !REACTIONS.includes(e) || !b) return false;
  RM.bucket = b; RM.cheerUntil = 0;
  roomSend({ t: "react", e });
  bubble(e, "You", RM.you);
  return true;
}

export const reactWait = () => tokenIn(RM.bucket, Date.now());

export function reactionsChanged() {
  if (!reactionsOn()) { RM.bubbles = []; RM.floats = []; RM.cheerUntil = 0; }
  fadeBubbles();
}

const CHEER_MS = 12000;

/** Offers a one-tap 🎉 for a moment after a focus round ends with others in the room. */
export function roomRoundEnded() {
  if (!RM.live || !reactionsOn() || !othersOf(RM.members, RM.you).length) return;
  RM.cheerUntil = Date.now() + CHEER_MS;
  renderRoom();
  setTimeout(() => { if (RM.cheerUntil && Date.now() >= RM.cheerUntil) { RM.cheerUntil = 0; renderRoom(); } }, CHEER_MS + 20);
}

// Synchronous like the markup it replaced: a focused field in the dialog has to hide and disable in one go, or Chrome moves focus elsewhere.
export function renderRoom() { room.refresh(); flushSync(); }
export const roomTick = () => roomClock.refresh();
