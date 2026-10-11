import { BACKDROPS, FACES, LOOKS, RINGS, timerBackdrop, timerFace, timerRing, type TimerBackdrop, type TimerFace, type TimerRing } from "./faces";

export interface SavedLook { id: string; name: string; face: TimerFace; ring: TimerRing; backdrop: TimerBackdrop }
export type Parts = { face: string; ring: string; backdrop: string };

export const MAX_LOOKS = 12, LOOK_NAME_MAX = 24;

const nameOf = (list: [string, string, string][], id: string) => list.find(([k]) => k === id)?.[1] || id;
const same = (a: Parts, b: Parts) => a.face === b.face && a.ring === b.ring && a.backdrop === b.backdrop;

/** A look's parts in words, like "Nixie · Glow ring · Film". */
export const describeLook = (l: Parts) => [nameOf(FACES, l.face), l.ring === "none" ? "No ring" : nameOf(RINGS, l.ring) + " ring", nameOf(BACKDROPS, l.backdrop)].join(" · ");

export const cleanLookName = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, LOOK_NAME_MAX);

/** The saved looks worth keeping from a stored list. */
export function savedLooks(v: unknown): SavedLook[] {
  if (!Array.isArray(v)) return [];
  const out: SavedLook[] = [];
  for (const l of v) {
    if (!l || typeof l.id !== "string" || !l.id || typeof l.name !== "string") continue;
    const look = { id: l.id, name: cleanLookName(l.name), face: timerFace(l.face), ring: timerRing(l.ring), backdrop: timerBackdrop(l.backdrop) };
    if (look.name && !out.some((o) => o.id === look.id || same(o, look))) out.push(look);
    if (out.length >= MAX_LOOKS) break;
  }
  return out;
}

/** The ready-made or saved look these parts make, if any. */
export const findLook = (l: Parts, mine: SavedLook[]) => LOOKS.find((x) => same(x, l)) || mine.find((x) => same(x, l));

/** The face's name, numbered when one of yours already has it. */
export function suggestName(l: Parts, mine: SavedLook[]): string {
  const base = nameOf(FACES, l.face), taken = new Set(mine.map((m) => m.name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = base + " " + n;
  return name;
}

/** Adds these parts as a look of your own, unless they already make one or the list is full. */
export function saveLook(mine: SavedLook[], l: Parts, id = "u" + Date.now().toString(36)): SavedLook[] {
  if (findLook(l, mine) || mine.length >= MAX_LOOKS) return mine;
  return [...mine, { id, name: suggestName(l, mine), face: timerFace(l.face), ring: timerRing(l.ring), backdrop: timerBackdrop(l.backdrop) }];
}

export function renameLook(mine: SavedLook[], id: string, name: string): SavedLook[] {
  const n = cleanLookName(name);
  return n ? mine.map((m) => (m.id === id ? { ...m, name: n } : m)) : mine;
}

export const deleteLook = (mine: SavedLook[], id: string) => mine.filter((m) => m.id !== id);
