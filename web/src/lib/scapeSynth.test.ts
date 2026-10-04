import { describe, expect, it } from "vitest";
import { Biquad, makeScape, Mixer, seeded } from "./scapeSynth";
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

function levels(x: Float32Array, ms: number) {
  const n = SR * ms / 1000, out: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) out.push(rms(x.subarray(i, i + n)));
  return out;
}

/** How tonal the loudest 4 ms moments in 1–8 kHz are: 1 is a pure ping, plain noise sits near 0.35. */
function ringing(x: Float32Array) {
  const hi = band(x, 1000, 8000), n = SR * 4 / 1000, frames = levels(hi, 4), cut = pct(frames, 0.995), out: number[] = [];
  frames.forEach((v, f) => {
    if (v < cut) return;
    const s = hi.subarray(f * n, f * n + n);
    let e = 0, best = 0;
    for (let i = 0; i < s.length; i++) e += s[i] * s[i];
    for (let lag = Math.round(SR / 6000); lag <= Math.round(SR / 1000); lag++) {
      let c = 0;
      for (let i = 0; i + lag < s.length; i++) c += s[i] * s[i + lag];
      best = Math.max(best, c / e);
    }
    out.push(best);
  });
  return out.reduce((a, b) => a + b, 0) / out.length;
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)];

/** How far the loud frames rise above the median, in dB. */
const burstiness = (x: Float32Array, ms = 10) => { const f = levels(x, ms); return db(pct(f, 0.98) / pct(f, 0.5)); };

/** Times the level climbs `rise` dB above its median after dropping back below it. */
function swells(env: number[], rise: number) {
  const mid = db(pct(env, 0.5));
  let n = 0, up = false;
  for (const v of env.map(db)) {
    if (!up && v > mid + rise) { n++; up = true; } else if (up && v < mid) up = false;
  }
  return n;
}

const out6 = Object.fromEntries(SCAPES.map((k) => [k, render(k, 6)])) as Record<Scape, { L: Float32Array; R: Float32Array }>;

describe("makeScape", () => {
  const out = out6;

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

  it("depends only on its random source", () => {
    for (const k of ["ocean", "fire"] as const) {
      expect(render(k, 2, 3).L).toEqual(render(k, 2, 3).L);
      expect(render(k, 2, 3).L).not.toEqual(render(k, 2, 4).L);
    }
  });
});

describe("ocean and fire", () => {
  const long = { rain: render("rain", 30), ocean: render("ocean", 30), fire: render("fire", 30) };

  it.each(["ocean", "fire"] as const)("%s is about as loud as rain", (k) => {
    expect(Math.abs(db(rms(long[k].L)) - db(rms(long.rain.L)))).toBeLessThan(2);
    expect(Math.abs(db(rms(long[k].R)) - db(rms(long.rain.R)))).toBeLessThan(2);
  });

  it("ocean rises and falls in waves", () => {
    const env = levels(long.ocean.L, 500);
    expect(swells(env, 3)).toBeGreaterThanOrEqual(2);
    expect(db(pct(env, 0.9) / pct(env, 0.1))).toBeGreaterThan(6);
  });

  it("ocean stays calm, with no sudden jumps or loud peaks", () => {
    const { L } = long.ocean, env = levels(L, 250).map(db);
    let jump = 0, peak = 0;
    for (let i = 1; i < env.length; i++) jump = Math.max(jump, env[i] - env[i - 1]);
    for (const v of L) peak = Math.max(peak, Math.abs(v));
    expect(jump).toBeLessThan(4);
    expect(db(peak / rms(L))).toBeLessThan(20);
    expect(db(pct(levels(L, 500), 1) / rms(L))).toBeLessThan(8);
  });

  it("fire crackles snap like wood instead of ringing like drops", () => {
    expect(ringing(long.fire.L)).toBeLessThan(0.5);
    expect(ringing(long.fire.L)).toBeLessThan(ringing(render("brown", 30).L) + 0.1);
  });

  it("fire is a low roar with sparse crackles", () => {
    const { L } = long.fire;
    expect(db(rms(band(L, 60, 700))) - db(rms(band(L, 1000, 3000)))).toBeGreaterThan(8);
    expect(burstiness(band(L, 3000, 7000), 5)).toBeGreaterThan(burstiness(band(long.rain.L, 3000, 7000), 5) + 10);
  });
});

describe("Mixer", () => {
  const steady = () => (L: Float32Array, R: Float32Array) => { L.fill(0.5); R.fill(-0.5); };
  const run = (m: Mixer, secs: number) => {
    const n = Math.round(secs * SR / 128) * 128, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i += 128) m.render(L.subarray(i, i + 128), R.subarray(i, i + 128));
    return { L, R };
  };

  it("glides a layer in and out in a straight line, without steps", () => {
    const m = new Mixer(SR, seeded(1), steady);
    m.set({ rain: 1 }, 0.5);
    const up = run(m, 1).L;
    expect(up[0]).toBeCloseTo(0.5 / (SR / 2), 6);
    expect(up[SR / 4]).toBeCloseTo(0.25, 3);
    expect(up[SR - 1]).toBe(0.5);
    m.set({}, 0.5);
    const down = run(m, 1).L;
    let step = 0;
    for (let i = 1; i < down.length; i++) step = Math.max(step, Math.abs(down[i] - down[i - 1]));
    expect(step).toBeLessThan(0.5 / (SR / 2) + 1e-6);
    expect(down[SR - 1]).toBe(0);
    expect(m.playing).toEqual([]);
  });

  it("only runs the layers that sound", () => {
    const m = new Mixer(SR, seeded(1), steady);
    m.set({ rain: 0.7, fire: 0.4, brown: 0 }, 0);
    run(m, 0.01);
    expect(m.playing.sort()).toEqual(["fire", "rain"]);
  });

  it("mixes real layers without clipping, even all loud at once", () => {
    const m = new Mixer(SR, seeded(5));
    m.set({ rain: 1, ocean: 1, fire: 1 }, 0);
    const { L, R } = run(m, 6);
    let peak = 0;
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    expect(L.every(Number.isFinite)).toBe(true);
    expect(peak).toBeLessThan(1);
    expect(db(rms(L))).toBeGreaterThan(db(rms(out6.rain.L)));
  });

  it("adds and drops layers without clicks", () => {
    const m = new Mixer(SR, seeded(9));
    m.set({ rain: 0.7 }, 0);
    const before = run(m, 2).L;
    m.set({ rain: 0.7, fire: 0.4 }, 0.8);
    const add = run(m, 2).L;
    m.set({ fire: 0.4 }, 0.8);
    const drop = run(m, 2).L;
    const jump = (x: Float32Array) => { let j = 0; for (let i = 1; i < x.length; i++) j = Math.max(j, Math.abs(x[i] - x[i - 1])); return j; };
    const base = jump(before) + jump(render("fire", 2, 9).L) * 0.4;
    expect(jump(add)).toBeLessThan(base);
    expect(jump(drop)).toBeLessThan(base);
  });
});
