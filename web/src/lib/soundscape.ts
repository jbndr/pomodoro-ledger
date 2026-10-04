export type Scape = "rain" | "ocean" | "fire" | "brown";
export const SCAPES: readonly Scape[] = ["rain", "ocean", "fire", "brown"];
export const FADE_IN = 3, FADE_OUT = 2, PHASE_FADE = 4, QUICK = 0.25, DUCK = 0.4;

/** The soundscape a stored value names, or null for off; the retired café plays ocean. */
export const scapeOf = (v: unknown): Scape | null => (v === "cafe" ? "ocean" : SCAPES.includes(v as Scape) ? (v as Scape) : null);

export const scapeVolume = (v: unknown) => (v == null || v === "" || isNaN(+v) ? 40 : Math.max(0, Math.min(100, Math.round(+v))));

export type Ramp = [seconds: number, gain: number][];
export interface RampTimes { fadeAt?: number; duckAt?: number }

/** Gain points in seconds from now, joined by linear ramps and starting at the current gain. */
export function scapeRamp(from: number, to: number, o: RampTimes & { quick?: boolean } = {}): Ramp {
  const span = o.quick ? QUICK : to > from ? FADE_IN * (to > 0 ? 1 - from / to : 1) : FADE_OUT * (from > 0 ? (from - to) / from : 1);
  const rise = Math.max(0.02, span);
  if (o.fadeAt != null) {
    const at = Math.max(0, o.fadeAt);
    if (at < rise) return [[Math.max(0.02, at), from + (to - from) * (at / rise)], [at + PHASE_FADE, 0]];
    return [[rise, to], [at, to], [at + PHASE_FADE, 0]];
  }
  if (o.duckAt != null && o.duckAt > rise) {
    const at = o.duckAt;
    return [[rise, to], [at, to], [at + 0.3, to * DUCK], [at + 1.8, to * DUCK], [at + 4, to]];
  }
  return [[rise, to]];
}

/**
 * Moving to another mix: fades out what's playing at `pace` (measured from its full level `was`),
 * swaps the layers once silent at `at`, then fades the next mix in.
 */
export function swapRamp(from: number, was: number, to: number, o: RampTimes = {}, pace = PHASE_FADE): { at: number; ramp: Ramp } {
  const at = from > 0.001 ? pace * (was > 0 ? Math.min(1, from / was) : 1) : 0;
  const shift = (x?: number) => (x == null ? undefined : x - at);
  const rest = scapeRamp(0, to, { fadeAt: shift(o.fadeAt), duckAt: shift(o.duckAt) }).map(([t, g]): [number, number] => [t + at, g]);
  return { at, ramp: at ? [[at, 0], ...rest] : rest };
}

/** A short listen from Settings: in, hold, out; a mix already sounding glides to the new one instead. */
export const previewRamp = (gain: number, from = 0): Ramp => [[from > 0 ? QUICK : 1, gain], [6, gain], [8, 0]];
