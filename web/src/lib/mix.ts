import { SCAPES, scapeOf, scapeVolume, type Scape } from "./soundscape";
import type { Mode, Status } from "./timer";

export interface Layer { kind: Scape; level: number }
export interface SavedMix { id: string; name: string; mix: string }
export type Phase = "focus" | "break";
export type Levels = Partial<Record<Scape, number>>;

export const MAX_LAYERS = 3, NEW_LEVEL = 60, MIN_LEVEL = 5, MAX_SAVED = 12, NAME_MAX = 32;
/** A stored break choice that follows the focus mix. */
export const SAME = "focus";

export const SCAPE_NAME: Record<Scape, string> = { rain: "Rain", ocean: "Ocean", fire: "Fire", brown: "Brown noise" };

export const PRESETS: readonly SavedMix[] = [
  { id: "stormy-cabin", name: "Stormy cabin", mix: "rain:70,fire:40" },
  { id: "deep-focus", name: "Deep focus", mix: "rain:25,brown:60" },
  { id: "night-harbour", name: "Night harbour", mix: "ocean:70,brown:25" },
  { id: "beach-bonfire", name: "Beach bonfire", mix: "ocean:55,fire:45" },
];

/** The layers a stored value names, like "rain:70,fire:40"; a single soundscape from before mixes plays alone at full level. */
export function parseMix(v: unknown): Layer[] {
  if (typeof v !== "string") return [];
  const one = scapeOf(v);
  if (one) return [{ kind: one, level: 100 }];
  const got = new Map<Scape, number>();
  for (const part of v.split(",")) {
    const [k, l] = part.split(":"), kind = scapeOf(k), level = Math.round(+l);
    if (kind && level > 0 && !got.has(kind) && got.size < MAX_LAYERS) got.set(kind, Math.min(100, level));
  }
  return SCAPES.filter((k) => got.has(k)).map((kind) => ({ kind, level: got.get(kind)! }));
}

export const mixCode = (layers: Layer[]) => parseMix(layers.map((l) => l.kind + ":" + l.level).join(",")).map((l) => l.kind + ":" + l.level).join(",");

export const mixLevels = (layers: Layer[]): Levels => Object.fromEntries(layers.map((l) => [l.kind, l.level / 100]));

export const describeMix = (layers: Layer[]) => layers.map((l) => SCAPE_NAME[l.kind] + " " + l.level + "%").join(" · ");

/** Turns a sound on at a gentle level, or off; a fourth layer isn't added. */
export function toggleLayer(layers: Layer[], kind: Scape): Layer[] {
  if (layers.some((l) => l.kind === kind)) return layers.filter((l) => l.kind !== kind);
  return layers.length >= MAX_LAYERS ? layers : parseMix(mixCode([...layers, { kind, level: NEW_LEVEL }]));
}

export const setLevel = (layers: Layer[], kind: Scape, level: number): Layer[] =>
  layers.map((l) => (l.kind === kind ? { kind, level: Math.max(MIN_LEVEL, Math.min(100, Math.round(level) || MIN_LEVEL)) } : l));

export interface MixSettings {
  soundscape?: string; soundscapeVolume?: number; soundscapeBreaks?: boolean; sound?: boolean;
  scapeFocus?: string; scapeBreak?: string; scapeMixes?: unknown;
}

/** What a phase plays as stored, reading the single soundscape setting from before mixes when there's no choice yet. */
export function storedChoice(s: MixSettings, phase: Phase): string {
  if (phase === "focus") return typeof s.scapeFocus === "string" ? s.scapeFocus : scapeOf(s.soundscape) ?? "";
  if (typeof s.scapeBreak === "string") return s.scapeBreak;
  return s.soundscapeBreaks && scapeOf(s.soundscape) ? SAME : "";
}

export function phaseMix(s: MixSettings, phase: Phase): Layer[] {
  const v = storedChoice(s, phase);
  return v === SAME ? (phase === "break" ? phaseMix(s, "focus") : []) : parseMix(v);
}

/** Writes a phase's choice, first pinning both phases so settings from before mixes stop applying. */
export function choose(s: MixSettings, phase: Phase, v: string) {
  const focus = storedChoice(s, "focus"), brk = storedChoice(s, "break");
  s.scapeFocus = phase === "focus" ? v : focus;
  s.scapeBreak = phase === "break" ? v : brk;
}

export const cleanName = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

/** The saved mixes worth keeping from a stored list. */
export function savedMixes(v: unknown): SavedMix[] {
  if (!Array.isArray(v)) return [];
  const out: SavedMix[] = [], ids = new Set<string>();
  for (const m of v) {
    if (!m || typeof m.id !== "string" || !m.id || ids.has(m.id) || typeof m.name !== "string") continue;
    const name = cleanName(m.name), mix = mixCode(parseMix(m.mix));
    if (name && mix) { ids.add(m.id); out.push({ id: m.id, name, mix }); }
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

/** Saves a mix under a name, replacing one of yours with the same name. */
export function saveMix(list: SavedMix[], name: string, layers: Layer[], id = "m" + Date.now().toString(36)): SavedMix[] {
  const n = cleanName(name), mix = mixCode(layers);
  if (!n || !mix) return list;
  const same = list.find((m) => m.name.toLowerCase() === n.toLowerCase());
  if (same) return list.map((m) => (m === same ? { ...m, name: n, mix } : m));
  return list.length >= MAX_SAVED ? list : [...list, { id, name: n, mix }];
}

export function renameMix(list: SavedMix[], id: string, name: string): SavedMix[] {
  const n = cleanName(name);
  return n ? list.map((m) => (m.id === id ? { ...m, name: n } : m)) : list;
}

export const deleteMix = (list: SavedMix[], id: string) => list.filter((m) => m.id !== id);

export const isPreset = (id: string) => PRESETS.some((p) => p.id === id);

/** The first saved mix or preset that sounds exactly like these layers. */
export function matchMix(layers: Layer[], mixes: readonly SavedMix[]): SavedMix | null {
  const code = mixCode(layers);
  return (code && mixes.find((m) => m.mix === code)) || null;
}

/** A phase's mix in a word or two, for summaries. */
export function mixLabel(s: MixSettings, phase: Phase): string {
  const layers = phaseMix(s, phase);
  if (!layers.length) return "Off";
  if (phase === "break" && storedChoice(s, phase) === SAME) return "Same as focus";
  const m = matchMix(layers, [...PRESETS, ...savedMixes(s.scapeMixes)]);
  return m ? m.name : layers.length === 1 ? SCAPE_NAME[layers[0].kind] : "Custom mix";
}

export interface ScapePlan {
  phase: Phase; mix: string; levels: Levels; gain: number;
  /** When the phase ends, if its mix should fade out then; otherwise 0. */
  fadeAt: number;
  /** When to dip under the end bell, as the same mix plays on; otherwise 0. */
  duckAt: number;
}

/** What should play right now, or null for silence. */
export function scapePlan(s: MixSettings, t: { mode: Mode; status: Status; endsAt: number }, now: number): ScapePlan | null {
  const phase: Phase = t.mode === "focus" ? "focus" : "break", layers = phaseMix(s, phase), gain = scapeVolume(s.soundscapeVolume) / 100;
  if (!layers.length || !gain || t.status !== "running" || t.endsAt <= now) return null;
  const mix = mixCode(layers), on = mixCode(phaseMix(s, phase === "focus" ? "break" : "focus")) === mix;
  return { phase, mix, levels: mixLevels(layers), gain, fadeAt: on ? 0 : t.endsAt, duckAt: on && s.sound ? t.endsAt : 0 };
}
