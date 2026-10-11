import type { TimerFace } from "./faces";
import { Biquad, seeded } from "./scapeSynth";

const TAU = 2 * Math.PI;

/** Half a second of one face's tick, starting when its digits change. */
export function tickSamples(face: TimerFace, rate: number): Float32Array {
  const out = new Float32Array(Math.ceil(rate * 0.5)), rand = seeded(7);
  const at = (sec: number, len: number, fn: (t: number) => number) => {
    const from = Math.round(sec * rate);
    for (let i = 0; i < len * rate && from + i < out.length; i++) out[from + i] += fn(i / rate);
  };
  // Decaying partials struck together: a hard, small object rather than a tone.
  const strike = (sec: number, gain: number, modes: [number, number, number][], body: number) => at(sec, 0.12, (t) => {
    const env = Math.min(1, t / 0.0015);
    return gain * env * (modes.reduce((s, [f, a, d]) => s + a * Math.sin(TAU * f * t) * Math.exp(-t * d), 0) + 0.5 * Math.sin(TAU * body * t) * Math.exp(-t * 70));
  });
  const burst = (sec: number, gain: number, len: number, filter: Biquad) => at(sec, len, (t) => gain * filter.run(rand() * 2 - 1) * Math.exp(-t / (len / 5)));

  if (face === "flap") {
    // The top leaf slaps down as the bottom one starts to fall, then it settles.
    burst(0.15, 0.34, 0.012, new Biquad(rate, "bp", 3200, 1.1));
    strike(0.15, 0.09, [[1870, 1, 150], [2960, 0.6, 190], [4150, 0.35, 240]], 210);
    burst(0.33, 0.12, 0.008, new Biquad(rate, "bp", 3600, 1.2));
    strike(0.33, 0.035, [[2050, 1, 180], [3240, 0.5, 220]], 240);
  } else if (face === "matrix") {
    at(0, 0.06, (t) => 0.125 * Math.min(1, t / 0.002) * Math.exp(-t * 90) * (Math.sin(TAU * 1320 * t) + 0.25 * Math.sin(TAU * 2640 * t)));
  } else if (face === "nixie") {
    // A relay closing, with a short trace of the tube's hum behind it.
    burst(0, 1.7, 0.006, new Biquad(rate, "lp", 1400, 0.8));
    at(0, 0.09, (t) => 0.11 * Math.min(1, t / 0.004) * Math.exp(-t * 30) * (Math.sin(TAU * 100 * t) + 0.6 * Math.sin(TAU * 300 * t) + 0.25 * Math.sin(TAU * 500 * t)));
  } else if (face === "vfd") {
    // A soft electronic blip with a little of the filament's buzz under it.
    at(0, 0.05, (t) => 0.12 * Math.min(1, t / 0.002) * Math.exp(-t * 110) * (Math.sin(TAU * 2093 * t) + 0.3 * Math.sin(TAU * 3140 * t)));
    at(0, 0.06, (t) => 0.042 * Math.min(1, t / 0.004) * Math.exp(-t * 60) * Math.sign(Math.sin(TAU * 120 * t)));
  } else if (face === "lcd") {
    // A quartz watch: one tiny, dry tick.
    burst(0, 1.3, 0.005, new Biquad(rate, "bp", 4600, 2.2));
    strike(0, 0.045, [[4100, 1, 300], [6150, 0.4, 400]], 900);
  } else if (face === "odo") {
    // The wheel slips off its detent, rolls, and knocks to a stop.
    burst(0, 0.18, 0.004, new Biquad(rate, "bp", 2600, 1.4));
    strike(0.3, 0.1, [[820, 1, 75], [1390, 0.5, 110], [2240, 0.25, 160]], 180);
    burst(0.3, 0.22, 0.006, new Biquad(rate, "bp", 1500, 1));
  } else if (face === "serif") {
    // A pencil set down on paper: soft, low and woody.
    burst(0, 0.62, 0.01, new Biquad(rate, "lp", 2200, 0.7));
    strike(0, 0.086, [[640, 1, 55], [1210, 0.35, 85]], 150);
  } else if (face === "words") {
    // A typewriter key pressed gently.
    burst(0, 0.64, 0.007, new Biquad(rate, "bp", 2400, 0.9));
    strike(0.004, 0.085, [[1650, 1, 120], [2700, 0.45, 160]], 230);
    burst(0.05, 0.17, 0.005, new Biquad(rate, "bp", 1800, 1.1));
  } else {
    // Rounded attack and low sine harmonics avoid the sharp click of a clock.
    at(0, 0.18, (t) => 0.16 * Math.min(1, t / 0.008) * Math.exp(-t * 38) * (Math.sin(TAU * 480 * t) + 0.18 * Math.sin(TAU * 960 * t)));
  }
  return out;
}
