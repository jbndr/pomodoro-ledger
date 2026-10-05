export type PhaseMorph = "wipe" | "clock" | "sweep" | "blend" | "grey" | "instant";

export const PHASE_MORPHS: [PhaseMorph, string, string][] = [
  ["wipe", "Wipe", "The new colour wipes across the timer card."],
  ["clock", "Clock sweep", "The new colour sweeps round the dial from 12 o'clock."],
  ["sweep", "Colour sweep", "The colour travels round the wheel: amber on the way to green, pink on the way to blue."],
  ["blend", "Blend", "A quick, direct blend between the two colours."],
  ["grey", "Through grey", "The colour drains to a soft grey, then the new one fills in."],
  ["instant", "Instant", "The colour switches at once with a small press of the dial."],
];

/** A stored phase-change style, falling back to the wipe. */
export function phaseMorph(v: unknown): PhaseMorph {
  return PHASE_MORPHS.some(([id]) => id === v) ? (v as PhaseMorph) : "wipe";
}
