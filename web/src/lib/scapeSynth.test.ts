import { describe, expect, it } from "vitest";
import { Biquad, makeScape, seeded } from "./scapeSynth";
import { SCAPES, type Scape } from "./soundscape";

const SR = 48000;

function render(kind: Scape, secs: number, seed = 7) {
  const r = makeScape(kind, SR, seeded(seed)), n = Math.round(secs * SR), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) r(L.subarray(i, i + 128), R.subarray(i, i + 128));
  return { L, R };
}

const rms = (x: ArrayLike<number>) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
const db = (v: number) => 20 * Math.log10(v);

function band(x: Float32Array, lo: number, hi: number) {
  const c = Math.sqrt(lo * hi), a = new Biquad(SR, "bp", c, c / (hi - lo)), b = new Biquad(SR, "bp", c, c / (hi - lo));
  return Float32Array.from(x, (v) => b.run(a.run(v)));
}

/** How far the loud frames rise above the median, in dB. */
function burstiness(x: Float32Array, ms = 10) {
  const n = SR * ms / 1000, frames: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) frames.push(rms(x.subarray(i, i + n)));
  frames.sort((a, b) => a - b);
  return db(frames[Math.floor(frames.length * 0.98)] / frames[frames.length >> 1]);
}

describe("makeScape", () => {
  const out = Object.fromEntries(SCAPES.map((k) => [k, render(k, 6)])) as Record<Scape, { L: Float32Array; R: Float32Array }>;

  it.each(SCAPES)("%s stays finite, within ±1 and at a gentle level", (k) => {
    const { L, R } = out[k];
    let peak = 0;
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    expect(L.every(Number.isFinite) && R.every(Number.isFinite)).toBe(true);
    expect(peak).toBeLessThan(0.9);
    expect(db(rms(L))).toBeGreaterThan(-27);
    expect(db(rms(L))).toBeLessThan(-16);
  });

  it.each(SCAPES)("%s has two different channels", (k) => {
    const { L, R } = out[k];
    let lr = 0;
    for (let i = 0; i < L.length; i++) lr += L[i] * R[i];
    expect(Math.abs(lr / L.length) / (rms(L) * rms(R))).toBeLessThan(0.8);
  });

  it.each(SCAPES)("%s never repeats a stretch", (k) => {
    const { L } = out[k], probe = L.subarray(SR, SR + 256);
    let repeats = 0;
    for (let lag = SR + 1; lag + 256 < L.length; lag++) {
      if (L[lag] !== probe[0] || L[lag + 1] !== probe[1]) continue;
      if (L.subarray(lag, lag + 256).every((v, i) => v === probe[i])) repeats++;
    }
    expect(repeats).toBe(0);
  });

  it("brown noise is a low rumble", () => {
    const { L } = out.brown;
    expect(db(rms(band(L, 60, 250))) - db(rms(band(L, 1000, 3000)))).toBeGreaterThan(10);
  });

  it("rain reaches the highs with separate drops, unlike plain noise", () => {
    const { L } = out.rain;
    expect(db(rms(band(L, 1000, 3000))) - db(rms(band(L, 250, 1000)))).toBeGreaterThan(-4);
    expect(burstiness(band(L, 7000, 14000))).toBeGreaterThan(burstiness(band(out.brown.L, 7000, 14000)) + 2);
  });

  it("café murmur rises and falls like speech", () => {
    expect(burstiness(band(out.cafe.L, 250, 1000), 60)).toBeGreaterThan(burstiness(band(out.brown.L, 250, 1000), 60) + 2);
  });

  it("depends only on its random source", () => {
    expect(render("cafe", 0.2, 3).L).toEqual(render("cafe", 0.2, 3).L);
    expect(render("cafe", 0.2, 3).L).not.toEqual(render("cafe", 0.2, 4).L);
  });
});
