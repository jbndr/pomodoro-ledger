import type { Mode, Status } from "./timer";

export type Scape = "rain" | "cafe" | "brown";
export const SCAPES: readonly Scape[] = ["rain", "cafe", "brown"];
export const FADE_IN = 3, FADE_OUT = 2, QUICK = 0.25, DUCK = 0.4;

export const scapeOf = (v: unknown): Scape | null => (SCAPES.includes(v as Scape) ? (v as Scape) : null);

export const scapeVolume = (v: unknown) => (v == null || v === "" || isNaN(+v) ? 40 : Math.max(0, Math.min(100, Math.round(+v))));

export interface ScapeSettings { soundscape?: string; soundscapeVolume?: number; soundscapeBreaks?: boolean; sound?: boolean }

export interface ScapePlan {
  kind: Scape; gain: number;
  /** When the phase ends, if the soundscape should fade out then; otherwise 0. */
  fadeAt: number;
  /** When to dip under the end bell; otherwise 0. */
  duckAt: number;
}

/** What should play right now, or null for silence. */
export function scapePlan(s: ScapeSettings, t: { mode: Mode; status: Status; endsAt: number }, now: number): ScapePlan | null {
  const kind = scapeOf(s.soundscape), gain = scapeVolume(s.soundscapeVolume) / 100, breaks = !!s.soundscapeBreaks;
  if (!kind || !gain || t.status !== "running" || t.endsAt <= now || (t.mode !== "focus" && !breaks)) return null;
  return { kind, gain, fadeAt: breaks ? 0 : t.endsAt, duckAt: breaks && s.sound ? t.endsAt : 0 };
}

export type Ramp = [seconds: number, gain: number][];

/** Gain points in seconds from now, joined by linear ramps and starting at the current gain. */
export function scapeRamp(from: number, to: number, o: { quick?: boolean; fadeAt?: number; duckAt?: number } = {}): Ramp {
  const span = o.quick ? QUICK : to > from ? FADE_IN * (to > 0 ? 1 - from / to : 1) : FADE_OUT * (from > 0 ? (from - to) / from : 1);
  const rise = Math.max(0.02, span);
  if (o.fadeAt != null) {
    const at = Math.max(0, o.fadeAt);
    if (at < rise) return [[Math.max(0.02, at), from + (to - from) * (at / rise)], [at + FADE_OUT, 0]];
    return [[rise, to], [at, to], [at + FADE_OUT, 0]];
  }
  if (o.duckAt != null && o.duckAt > rise) {
    const at = o.duckAt;
    return [[rise, to], [at, to], [at + 0.3, to * DUCK], [at + 1.8, to * DUCK], [at + 4, to]];
  }
  return [[rise, to]];
}

/** A short listen from Settings: in, hold, out. */
export const previewRamp = (gain: number): Ramp => [[1, gain], [6, gain], [8, 0]];
