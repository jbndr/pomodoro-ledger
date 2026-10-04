import type { Scape } from "./soundscape";

/** Fills one block of stereo output. */
export type Render = (left: Float32Array, right: Float32Array) => void;
export type Rand = () => number;

export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = 2 * Math.PI;
const between = (rand: Rand, lo: number, hi: number) => lo + (hi - lo) * rand();

export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; z1 = 0; z2 = 0;
  constructor(private sr: number, type: "lp" | "hp" | "bp", f: number, q: number) { this.set(type, f, q); }
  set(type: "lp" | "hp" | "bp", f: number, q: number) {
    const w = TAU * Math.min(f, this.sr * 0.45) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), n = 1 + al;
    if (type === "lp") { this.b1 = (1 - c) / n; this.b0 = this.b2 = this.b1 / 2; }
    else if (type === "hp") { this.b1 = -(1 + c) / n; this.b0 = this.b2 = (1 + c) / 2 / n; }
    else { this.b0 = al / n; this.b1 = 0; this.b2 = -al / n; }
    this.a1 = -2 * c / n; this.a2 = (1 - al) / n;
  }
  run(x: number) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class OnePole {
  y = 0; a: number;
  constructor(sr: number, f: number) { this.a = 1 - Math.exp(-TAU * f / sr); }
  run(x: number) { return (this.y += this.a * (x - this.y)); }
}

class Pink {
  b0 = 0; b1 = 0; b2 = 0;
  run(w: number) {
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
}

class Brown {
  y = 0;
  run(w: number) { return (this.y = (this.y + 0.02 * w) / 1.02) * 3.5; }
}

/** A value that glides between random targets, each reached in minS to maxS seconds. */
class Drift {
  v: number; from: number; to: number; n = 0; len = 0;
  constructor(private rand: Rand, private lo: number, private hi: number, private minS: number, private maxS: number, private rate: number) {
    this.v = this.from = this.to = between(rand, lo, hi);
  }
  run() {
    if (this.n >= this.len) {
      this.from = this.v; this.to = between(this.rand, this.lo, this.hi);
      this.len = Math.max(1, Math.round(between(this.rand, this.minS, this.maxS) * this.rate)); this.n = 0;
    }
    const t = this.n++ / this.len;
    return (this.v = this.from + (this.to - this.from) * t * t * (3 - 2 * t));
  }
}

/** A small feedback delay network: four damped lines with a Householder mix. */
class Room {
  lines: Float32Array[]; pos = [0, 0, 0, 0]; lp = [0, 0, 0, 0]; gain: number[]; damp: number; l = 0; r = 0;
  constructor(sr: number, size: number, rt60: number, dampHz: number) {
    this.lines = [29.7, 37.1, 41.1, 47.3].map((ms) => new Float32Array(Math.round(ms * size * sr / 1000)));
    this.gain = this.lines.map((d) => Math.pow(10, -3 * d.length / sr / rt60));
    this.damp = 1 - Math.exp(-TAU * dampHz / sr);
  }
  run(inL: number, inR: number) {
    const { lines, pos, lp, gain, damp } = this;
    let sum = 0;
    for (let k = 0; k < 4; k++) { lp[k] += damp * (lines[k][pos[k]] - lp[k]); sum += lp[k]; }
    sum *= 0.5;
    for (let k = 0; k < 4; k++) {
      lines[k][pos[k]] = (lp[k] - sum) * gain[k] + (k & 1 ? inR : inL);
      if (++pos[k] >= lines[k].length) pos[k] = 0;
    }
    this.l = lp[0] - lp[2]; this.r = lp[1] - lp[3];
  }
}

/** Damped sine partials, two multiplies a sample each. */
class Modes {
  n = 0; max: number;
  y1: Float64Array; y2: Float64Array; c: Float64Array; r2: Float64Array; gl: Float64Array; gr: Float64Array; left: Int32Array; wait: Int32Array;
  constructor(private sr: number, max = 64) {
    this.max = max;
    this.y1 = new Float64Array(max); this.y2 = new Float64Array(max); this.c = new Float64Array(max); this.r2 = new Float64Array(max);
    this.gl = new Float64Array(max); this.gr = new Float64Array(max); this.left = new Int32Array(max); this.wait = new Int32Array(max);
  }
  /** Strikes a partial at f Hz with amplitude a, ringing for tau seconds, after `delay` seconds. */
  add(f: number, a: number, tau: number, pan: number, delay = 0) {
    if (this.n >= this.max || f >= this.sr * 0.45) return;
    const i = this.n++, w = TAU * f / this.sr, r = Math.exp(-1 / (tau * this.sr));
    this.c[i] = 2 * r * Math.cos(w); this.r2[i] = r * r;
    this.y2[i] = 0; this.y1[i] = a * r * Math.sin(w);
    this.gl[i] = Math.cos(pan * Math.PI / 2); this.gr[i] = Math.sin(pan * Math.PI / 2);
    this.left[i] = Math.round(tau * this.sr * Math.log(Math.max(2, a / 1e-5))); this.wait[i] = Math.round(delay * this.sr);
  }
  l = 0; r = 0;
  run() {
    let l = 0, r = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.wait[i] > 0) { this.wait[i]--; continue; }
      const y = this.c[i] * this.y1[i] - this.r2[i] * this.y2[i];
      this.y2[i] = this.y1[i]; this.y1[i] = y;
      l += y * this.gl[i]; r += y * this.gr[i];
      if (--this.left[i] <= 0) this.drop(i--);
    }
    this.l = l; this.r = r;
  }
  private drop(i: number) {
    const j = --this.n;
    this.y1[i] = this.y1[j]; this.y2[i] = this.y2[j]; this.c[i] = this.c[j]; this.r2[i] = this.r2[j];
    this.gl[i] = this.gl[j]; this.gr[i] = this.gr[j]; this.left[i] = this.left[j]; this.wait[i] = this.wait[j];
  }
}

/** Short noise grains with exponential decay, summed into a stereo bus. */
class Grains {
  n = 0; env: Float64Array; k: Float64Array; gl: Float64Array; gr: Float64Array; l = 0; r = 0;
  constructor(private rand: Rand, private max = 48) {
    this.env = new Float64Array(max); this.k = new Float64Array(max); this.gl = new Float64Array(max); this.gr = new Float64Array(max);
  }
  add(a: number, decaySamples: number, pan: number) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.env[i] = a; this.k[i] = Math.exp(-1 / decaySamples);
    this.gl[i] = Math.cos(pan * Math.PI / 2); this.gr[i] = Math.sin(pan * Math.PI / 2);
  }
  run() {
    let l = 0, r = 0;
    for (let i = 0; i < this.n; i++) {
      const x = this.env[i] * (this.rand() * 2 - 1);
      l += x * this.gl[i]; r += x * this.gr[i];
      if ((this.env[i] *= this.k[i]) < 1e-4) {
        const j = --this.n;
        this.env[i] = this.env[j]; this.k[i] = this.k[j]; this.gl[i] = this.gl[j]; this.gr[i] = this.gr[j]; i--;
      }
    }
    this.l = l; this.r = r;
  }
}

function brown(sr: number, rand: Rand): Render {
  const a = new Brown(), b = new Brown(), c = new Brown();
  const la = new OnePole(sr, 900), lb = new OnePole(sr, 900), ha = new Biquad(sr, "hp", 28, 0.7), hb = new Biquad(sr, "hp", 28, 0.7);
  return (L, R) => {
    for (let i = 0; i < L.length; i++) {
      const mid = c.run(rand() * 2 - 1) * 0.55;
      L[i] = 0.5 * ha.run(la.run(a.run(rand() * 2 - 1) * 0.85 + mid));
      R[i] = 0.5 * hb.run(lb.run(b.run(rand() * 2 - 1) * 0.85 + mid));
    }
  };
}

/** Steady rain: a warm noise bed, dense tiny impacts, a few nearer drops on surfaces and the odd bubble. */
function rain(sr: number, rand: Rand): Render {
  const pl = new Pink(), pr = new Pink();
  const bed = [0, 1].map(() => [new Biquad(sr, "hp", 280, 0.6), new Biquad(sr, "lp", 3800, 0.5)]);
  const fine = new Grains(rand, 96), near = new Grains(rand, 16);
  const fineTone = [0, 1].map(() => [new Biquad(sr, "hp", 900, 0.6), new Biquad(sr, "lp", 6500, 0.6)]);
  const nearTone = [0, 1].map(() => new Biquad(sr, "bp", 2200, 0.8));
  const rings = new Modes(sr, 48), room = new Room(sr, 0.8, 0.5, 3500);
  const gust = new Drift(rand, 0.8, 1.12, 3, 11, sr), patter = new Drift(rand, 0.2, 1.6, 1.5, 7, sr);
  return (L, R) => {
    for (let i = 0; i < L.length; i++) {
      const g = gust.run(), p = patter.run();
      if (rand() < (800 * g * g) / sr) fine.add(0.5 * Math.exp(-3 * rand()), between(rand, 0.25, 1.4) * sr / 1000, rand());
      if (rand() < (3.5 * p * g) / sr) {
        const a = between(rand, 0.2, 0.6) * Math.exp(-1.2 * rand()), pan = between(rand, 0.06, 0.94), f = between(rand, 700, 2800);
        near.add(a, between(rand, 0.8, 3) * sr / 1000, pan);
        rings.add(f, a * 0.08, between(rand, 0.008, 0.03), pan);
        if (rand() < 0.5) rings.add(f * between(rand, 1.6, 2.4), a * 0.04, 0.01, pan);
      }
      if (rand() < 6 / sr) rings.add(1600 * Math.pow(2, rand() * 1.5), between(rand, 0.005, 0.02), between(rand, 0.004, 0.012), rand());
      fine.run(); near.run(); rings.run();
      const bl = bed[0][1].run(bed[0][0].run(pl.run(rand() * 2 - 1))) * 0.35 * g;
      const br = bed[1][1].run(bed[1][0].run(pr.run(rand() * 2 - 1))) * 0.35 * g;
      const dl = fineTone[0][1].run(fineTone[0][0].run(fine.l)) + nearTone[0].run(near.l) * 1.6 + rings.l;
      const dr = fineTone[1][1].run(fineTone[1][0].run(fine.r)) + nearTone[1].run(near.r) * 1.6 + rings.r;
      room.run(dl, dr);
      L[i] = 1.2 * (bl + dl + 0.35 * room.l);
      R[i] = 1.2 * (br + dr + 0.35 * room.r);
    }
  };
}

const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [500, 1500, 2500], [660, 1720, 2410], [440, 1020, 2240]];

/** One distant talker: a buzzy source through gliding vowel formants, in syllables and phrases. */
class Talker {
  private phase = 0; private f0 = 120; private base = 120; private scale = 1; private tilt: OnePole; private far: OnePole;
  private fs = [new Float64Array(3), new Float64Array(3)]; private bp: Biquad[];
  private syl = 0; private sylLen = 1; private sylAmp = 0; private floor = 0; private talking = false; private phrase = 0; private gap = 0;
  private intonation = 1; private accent = 1; private accentTo = 1; private level = 1; gl = 0; gr = 0; private block = 0;
  constructor(private sr: number, private rand: Rand) {
    this.tilt = new OnePole(sr, 1100); this.far = new OnePole(sr, 1500);
    this.bp = [0, 1, 2].map(() => new Biquad(sr, "bp", 1000, 5));
    this.meet();
    this.vowel(); this.fs[0].set(this.fs[1]);
    this.gap = Math.round(between(rand, 0, 4) * sr);
  }
  /** A new person at a new table. */
  private meet() {
    const r = this.rand, high = r() < 0.45;
    this.base = high ? between(r, 175, 235) : between(r, 95, 140);
    this.scale = high ? 1.14 : 1;
    this.level = between(r, 0.35, 1);
    this.far = new OnePole(this.sr, 1200 + 1600 * this.level);
    const pan = between(r, 0.1, 0.9);
    this.gl = Math.cos(pan * Math.PI / 2); this.gr = Math.sin(pan * Math.PI / 2);
  }
  private vowel() {
    const v = VOWELS[Math.floor(this.rand() * VOWELS.length)];
    for (let k = 0; k < 3; k++) this.fs[1][k] = v[k] * this.scale * between(this.rand, 0.92, 1.08);
  }
  private nextSyllable() {
    const r = this.rand;
    this.sylLen = Math.round(between(r, 0.11, 0.26) * this.sr); this.syl = 0;
    const wordEnd = r() < 0.3;
    this.floor = wordEnd ? 0 : 0.3;
    this.sylAmp = between(r, 0.45, 1);
    this.accentTo = between(r, 0.86, 1.16);
    this.vowel();
  }
  run() {
    if (!this.talking) {
      if (--this.gap > 0) return 0;
      this.talking = true;
      this.phrase = Math.round(between(this.rand, 1.2, 4.5) * this.sr);
      this.intonation = between(this.rand, 1.02, 1.12);
      this.nextSyllable();
    }
    if (this.syl >= this.sylLen) {
      if (this.phrase <= 0) {
        this.talking = false;
        this.gap = Math.round((this.rand() < 0.25 ? between(this.rand, 3, 9) : between(this.rand, 0.3, 2.5)) * this.sr);
        if (this.rand() < 0.04) this.meet();
        return 0;
      }
      this.nextSyllable();
    }
    if ((this.block++ & 63) === 0) {
      for (let k = 0; k < 3; k++) this.fs[0][k] += (this.fs[1][k] - this.fs[0][k]) * 0.06;
      this.bp[0].set("bp", this.fs[0][0], this.fs[0][0] / 90);
      this.bp[1].set("bp", this.fs[0][1], this.fs[0][1] / 120);
      this.bp[2].set("bp", this.fs[0][2], this.fs[0][2] / 160);
      this.intonation += (0.97 - this.intonation) * 0.0008;
      this.accent += (this.accentTo - this.accent) * 0.04;
    }
    const t = this.syl++ / this.sylLen;
    this.phrase--;
    const shape = t < 0.25 ? Math.sin(t * 2 * Math.PI) : Math.cos((t - 0.25) / 0.75 * Math.PI / 2);
    const env = this.sylAmp * (this.floor + (1 - this.floor) * shape * shape);
    this.f0 = this.base * this.intonation * this.accent * (1 + 0.012 * (this.rand() - 0.5));
    this.phase += this.f0 / this.sr;
    if (this.phase >= 1) this.phase -= 1;
    const src = this.tilt.run(1 - 2 * this.phase) * 3 + (this.rand() * 2 - 1) * 0.2;
    const voice = this.bp[0].run(src) + 1.5 * this.bp[1].run(src) + this.bp[2].run(src);
    return this.far.run(voice) * env * this.level;
  }
}

/** A café: room tone, a murmur of distant talkers and a crowd bed, and now and then a cup or spoon. */
function cafe(sr: number, rand: Rand): Render {
  const tone = [new Brown(), new Brown()], toneLp = [new OnePole(sr, 260), new OnePole(sr, 260)];
  const crowdSrc = [new Pink(), new Pink()];
  const crowd = [new Biquad(sr, "bp", 500, 1.2), new Biquad(sr, "bp", 500, 1.2), new Biquad(sr, "bp", 1400, 1.6), new Biquad(sr, "bp", 1400, 1.6)];
  const f1 = new Drift(rand, 380, 720, 0.15, 0.5, sr / 64), f2 = new Drift(rand, 1000, 1800, 0.15, 0.5, sr / 64), swell = new Drift(rand, 0.55, 1, 0.6, 2.5, sr);
  const talkers = Array.from({ length: 7 }, () => new Talker(sr, rand));
  const cups = new Modes(sr, 48), cupTone = [new Biquad(sr, "lp", 6500, 0.7), new Biquad(sr, "lp", 6500, 0.7)];
  const room = new Room(sr, 1.4, 1.1, 2600);
  let wait = Math.round(between(rand, 2, 6) * sr), blk = 0;
  const strike = (f: number, ratios: number[], a: number, tau: number, pan: number, delay: number) => {
    ratios.forEach((m, k) => cups.add(f * m * between(rand, 0.985, 1.015), a / (1 + k * 0.9), tau / (1 + k * 0.8), pan, delay));
  };
  const clink = () => {
    const pan = between(rand, 0.12, 0.88), a = between(rand, 0.02, 0.055), kind = rand();
    if (kind < 0.4) {
      const f = between(rand, 2300, 3600), hits = 2 + Math.floor(rand() * 4);
      let at = 0;
      for (let h = 0; h < hits; h++) { strike(f, [1, 2.32, 4.25], a * between(rand, 0.5, 1), between(rand, 0.06, 0.12), pan, at); at += between(rand, 0.1, 0.19); }
    } else if (kind < 0.75) {
      const f = between(rand, 1100, 1900);
      strike(f, [1, 1.58, 2.71, 4.13], a * 1.3, between(rand, 0.12, 0.3), pan, 0);
      if (rand() < 0.4) strike(f * between(rand, 1.4, 1.9), [1, 2.32], a * 0.6, 0.08, pan, between(rand, 0.04, 0.09));
    } else strike(between(rand, 3200, 5200), [1, 2.76, 5.4], a * 0.8, between(rand, 0.04, 0.08), pan, 0);
  };
  return (L, R) => {
    for (let i = 0; i < L.length; i++) {
      if (--wait <= 0) { clink(); wait = Math.round((1.5 + -Math.log(1 - rand()) * 6) * sr); }
      if ((blk++ & 63) === 0) {
        const a = f1.run(), b = f2.run();
        crowd[0].set("bp", a, 1.2); crowd[1].set("bp", a * 1.07, 1.2); crowd[2].set("bp", b, 1.6); crowd[3].set("bp", b * 0.94, 1.6);
      }
      const s = swell.run();
      let vl = 0, vr = 0;
      for (const t of talkers) { const v = t.run(); vl += v * t.gl; vr += v * t.gr; }
      cups.run();
      const cl = cupTone[0].run(cups.l), cr = cupTone[1].run(cups.r);
      const nl = crowdSrc[0].run(rand() * 2 - 1), nr = crowdSrc[1].run(rand() * 2 - 1);
      const bedL = toneLp[0].run(tone[0].run(rand() * 2 - 1)) * 0.3 + (crowd[0].run(nl) + 0.5 * crowd[2].run(nl)) * 0.3 * s;
      const bedR = toneLp[1].run(tone[1].run(rand() * 2 - 1)) * 0.3 + (crowd[1].run(nr) + 0.5 * crowd[3].run(nr)) * 0.3 * s;
      room.run(vl * 0.5 + cl * 0.8, vr * 0.5 + cr * 0.8);
      L[i] = 0.8 * (bedL + vl * 0.35 + cl * 0.6 + room.l * 0.5);
      R[i] = 0.8 * (bedR + vr * 0.35 + cr * 0.6 + room.r * 0.5);
    }
  };
}

const MAKERS: Record<Scape, (sr: number, rand: Rand) => Render> = { brown, rain, cafe };

/** A soundscape generator that never repeats; output is clamped to ±1. */
export function makeScape(kind: Scape, sr: number, rand: Rand = Math.random): Render {
  const render = MAKERS[kind](sr, rand);
  return (L, R) => {
    render(L, R);
    for (let i = 0; i < L.length; i++) {
      if (L[i] > 1) L[i] = 1; else if (L[i] < -1) L[i] = -1;
      if (R[i] > 1) R[i] = 1; else if (R[i] < -1) R[i] = -1;
    }
  };
}
