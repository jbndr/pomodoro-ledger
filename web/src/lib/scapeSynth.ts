import { SCAPES, type Scape } from "./soundscape";

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

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Rounds off the rare peak above 0.7, never passing 0.85. */
const soft = (x: number) => (x > 0.7 ? 0.7 + 0.15 * Math.tanh((x - 0.7) / 0.15) : x < -0.7 ? -0.7 - 0.15 * Math.tanh((-x - 0.7) / 0.15) : x);

/** One wave: a low swell that builds, breaks into a wash and recedes into foam. */
class Wave {
  n = 0; len = 0; rise = 1; amp = 0; tBody = 1; tWash = 1; tFoam = 1; top = 0; gl = 0; gr = 0;
  level = 0; wash = 0; foam = 0; l = 0; r = 0;
  private src = [new Pink(), new Pink()]; private lp: Biquad[];
  constructor(private sr: number) { this.lp = [0, 1].map(() => new Biquad(sr, "lp", 200, 0.7)); }
  start(rand: Rand, secs: number, side: number) {
    this.n = 0; this.len = Math.round(secs * this.sr);
    this.rise = between(rand, 3.2, 5.2); this.amp = between(rand, 0.7, 1);
    this.tBody = between(rand, 2.4, 3.6); this.tWash = between(rand, 0.9, 1.6); this.tFoam = between(rand, 3, 4.5);
    this.top = between(rand, 1500, 2600);
    const pan = 0.5 + side * between(rand, 0.08, 0.16);
    this.gl = Math.cos(pan * Math.PI / 2) * Math.SQRT2; this.gr = Math.sin(pan * Math.PI / 2) * Math.SQRT2;
  }
  shape(step: number) {
    if (this.n >= this.len) { this.level = this.wash = this.foam = 0; return; }
    const t = this.n / this.sr, after = t - this.rise, fade = this.amp * smooth((this.len - this.n) / this.sr / 1.5);
    this.n += step;
    this.level = fade * (after < 0 ? smooth(t / this.rise) : Math.exp(-after / this.tBody));
    this.wash = fade * (after < 0 ? smooth(1 + after) : Math.exp(-after / this.tWash));
    this.foam = fade * smooth((after + 0.2) / 0.9) * Math.exp(-Math.max(0, after) / this.tFoam);
    const f = 150 + (this.top - 150) * Math.pow(this.level / this.amp, 1.5);
    this.lp[0].set("lp", f, 0.7); this.lp[1].set("lp", f, 0.7);
  }
  run(rand: Rand) {
    const s = rand() * 2 - 1;
    this.l = this.lp[0].run(this.src[0].run(0.6 * s + 0.8 * (rand() * 2 - 1))) * this.level * this.gl;
    this.r = this.lp[1].run(this.src[1].run(0.6 * s + 0.8 * (rand() * 2 - 1))) * this.level * this.gr;
  }
}

/** Calm surf: overlapping waves on an irregular cycle over a low, distant sea. */
function ocean(sr: number, rand: Rand): Render {
  const waves = [new Wave(sr), new Wave(sr)], sea = [new Brown(), new Brown(), new Brown()], seaLp = [new OnePole(sr, 110), new OnePole(sr, 110)];
  const washSrc = [new Pink(), new Pink()], washTone = [0, 1].map(() => [new Biquad(sr, "hp", 400, 0.6), new Biquad(sr, "lp", 6500, 0.6)]);
  const fizz = new Grains(rand, 32), foamTone = [0, 1].map(() => [new Biquad(sr, "hp", 2600, 0.7), new Biquad(sr, "lp", 9500, 0.7)]);
  const lowCut = [0, 1].map(() => [new Biquad(sr, "hp", 60, 0.7), new Biquad(sr, "hp", 30, 0.7)]);
  let wait = Math.round(between(rand, 0.3, 1.5) * sr), k = 0, side = rand() < 0.5 ? -1 : 1, blk = 0, wash = 0, foam = 0;
  return (L, R) => {
    for (let i = 0; i < L.length; i++) {
      if (--wait <= 0) {
        const gap = between(rand, 8, 14);
        waves[k].start(rand, gap + between(rand, 2.5, 4), side);
        wait = Math.round(gap * sr); k ^= 1; side = -side;
      }
      if ((blk++ & 63) === 0) {
        wash = 0; foam = 0;
        for (const w of waves) { w.shape(64); wash += w.wash * w.wash; foam += w.foam; }
        wash = Math.sqrt(wash);
      }
      if (rand() < (1500 * foam) / sr) fizz.add(between(rand, 0.02, 0.08) * foam, between(rand, 0.15, 1) * sr / 1000, between(rand, 0.1, 0.9));
      fizz.run();
      let bl = 0, br = 0;
      for (const w of waves) if (w.level > 0) { w.run(rand); bl += w.l; br += w.r; }
      const mid = sea[2].run(rand() * 2 - 1) * 0.5;
      const sl = seaLp[0].run(sea[0].run(rand() * 2 - 1) * 0.8 + mid), sr2 = seaLp[1].run(sea[1].run(rand() * 2 - 1) * 0.8 + mid);
      const wl = washTone[0][1].run(washTone[0][0].run(washSrc[0].run(rand() * 2 - 1))) * wash;
      const wr = washTone[1][1].run(washTone[1][0].run(washSrc[1].run(rand() * 2 - 1))) * wash;
      const fl = foamTone[0][1].run(foamTone[0][0].run((rand() * 2 - 1) * foam * 0.5 + fizz.l));
      const fr = foamTone[1][1].run(foamTone[1][0].run((rand() * 2 - 1) * foam * 0.5 + fizz.r));
      L[i] = soft(0.62 * (0.9 * lowCut[0][0].run(bl) + wl + 0.7 * fl + 0.75 * lowCut[0][1].run(sl)));
      R[i] = soft(0.62 * (0.9 * lowCut[1][0].run(br) + wr + 0.7 * fr + 0.75 * lowCut[1][1].run(sr2)));
    }
  };
}

/** A fireplace: a breathing low roar, a faint sizzle, crackles that snap rather than ring, and now and then a hiss of steam. */
function fire(sr: number, rand: Rand): Render {
  const roar = [new Pink(), new Pink()];
  const roarTone = [0, 1].map(() => [new Biquad(sr, "hp", 70, 0.7), new Biquad(sr, "lp", 500, 0.7)]);
  const breath = new Drift(rand, 0.65, 1.1, 0.4, 1.8, sr / 64), glow = new Drift(rand, 380, 720, 0.6, 2.5, sr / 64), busy = new Drift(rand, 0.45, 1.6, 6, 20, sr / 64);
  const grit = new Grains(rand, 96), gritTone = [0, 1].map(() => [new Biquad(sr, "hp", 650, 0.5), new Biquad(sr, "lp", 8500, 0.5)]);
  const fizz = new Grains(rand, 32), fizzTone = [new Biquad(sr, "hp", 2600, 0.5), new Biquad(sr, "hp", 2600, 0.5)];
  const thump = new Modes(sr, 8);
  const steamTone = [new Biquad(sr, "bp", 4500, 1.1), new Biquad(sr, "bp", 4500, 1.1)];
  const room = new Room(sr, 0.6, 0.35, 3000);
  const queue: number[] = [];
  let blk = 0, now = 0, g = 1, rate = 2.2, steamN = 0, steamLen = 0, steamAmp = 0, steamWait = Math.round(between(rand, 8, 25) * sr);
  const burst = (n: number, spanMs: number, amp: number, lenMs: [number, number], pan: number) => {
    for (let k = 0; k < n && queue.length < 240; k++) {
      const at = now + Math.round(Math.pow(rand(), 1.6) * spanMs * sr / 1000);
      queue.push(at, amp * between(rand, 0.25, 1) * Math.exp(-2 * k / n), between(rand, lenMs[0], lenMs[1]) * sr / 1000, pan + between(rand, -0.06, 0.06));
    }
  };
  const crackle = () => {
    const pan = between(rand, 0.3, 0.7);
    if (rand() < 0.07) {
      const a = between(rand, 0.16, 0.26);
      burst(8 + Math.floor(rand() * 12), between(rand, 20, 50), a, [0.08, 0.6], pan);
      thump.add(between(rand, 70, 140), a * 0.45, between(rand, 0.02, 0.045), pan);
    } else burst(2 + Math.floor(rand() * 10), between(rand, 3, 25), between(rand, 0.06, 0.2) * Math.exp(-rand()), [0.03, 0.22], pan);
  };
  return (L, R) => {
    for (let i = 0; i < L.length; i++, now++) {
      if ((blk++ & 63) === 0) {
        g = breath.run(); rate = 2.2 * busy.run();
        const f = glow.run();
        roarTone[0][1].set("lp", f, 0.7); roarTone[1][1].set("lp", f * 1.04, 0.7);
      }
      if (rand() < rate / sr) crackle();
      if (rand() < 40 * rate / 2.2 / sr) fizz.add(between(rand, 0.004, 0.02), between(rand, 0.02, 0.08) * sr / 1000, between(rand, 0.25, 0.75));
      for (let q = 0; q < queue.length; q += 4) {
        if (queue[q] > now) continue;
        grit.add(queue[q + 1], queue[q + 2], queue[q + 3]);
        queue.splice(q, 4); q -= 4;
      }
      let hl = 0, hr = 0;
      if (steamLen) {
        const e = Math.sin(Math.PI * steamN / steamLen), a = steamAmp * e * e;
        hl = steamTone[0].run(rand() * 2 - 1) * a; hr = steamTone[1].run(rand() * 2 - 1) * a;
        if (++steamN >= steamLen) { steamLen = 0; steamWait = Math.round(between(rand, 12, 40) * sr); }
      } else if (--steamWait <= 0) {
        steamN = 0; steamLen = Math.round(between(rand, 1, 3) * sr); steamAmp = between(rand, 0.05, 0.1);
        const f = between(rand, 3000, 6000);
        steamTone[0].set("bp", f, 1.1); steamTone[1].set("bp", f * 1.08, 1.1);
      }
      grit.run(); fizz.run(); thump.run();
      const mid = (rand() * 2 - 1) * 0.6;
      const rl = roarTone[0][1].run(roarTone[0][0].run(roar[0].run((rand() * 2 - 1) * 0.8 + mid))) * g;
      const rr = roarTone[1][1].run(roarTone[1][0].run(roar[1].run((rand() * 2 - 1) * 0.8 + mid))) * g;
      const dl = gritTone[0][1].run(gritTone[0][0].run(grit.l)) + thump.l, dr = gritTone[1][1].run(gritTone[1][0].run(grit.r)) + thump.r;
      room.run(dl, dr);
      L[i] = soft(0.42 * rl + 3 * (dl + 0.3 * room.l) + fizzTone[0].run(fizz.l) + hl);
      R[i] = soft(0.42 * rr + 3 * (dr + 0.3 * room.r) + fizzTone[1].run(fizz.r) + hr);
    }
  };
}

const MAKERS: Record<Scape, (sr: number, rand: Rand) => Render> = { brown, rain, ocean, fire };

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

/** Above 0.8 peaks bend smoothly toward 0.99, so a loud mix never clips. */
const limit = (x: number) => (x > 0.8 ? 0.8 + 0.19 * Math.tanh((x - 0.8) / 0.19) : x < -0.8 ? -0.8 - 0.19 * Math.tanh((-x - 0.8) / 0.19) : x);

type Voice = { render?: Render; g: number; to: number; step: number };

/** Up to four soundscapes in one stream; each level glides in a straight line to its target, and silent ones stop running. */
export class Mixer {
  private voices = new Map<Scape, Voice>();
  private l = new Float32Array(128); private r = new Float32Array(128);
  constructor(private sr: number, private rand: Rand = Math.random, private make = makeScape) {}

  /** Moves each layer to its level (0–1, missing means off) over `glide` seconds. */
  set(levels: Partial<Record<Scape, number>>, glide: number) {
    const n = Math.max(1, Math.round(glide * this.sr));
    for (const kind of SCAPES) {
      const to = Math.max(0, Math.min(1, levels[kind] || 0));
      let v = this.voices.get(kind);
      if (!v) { if (!to) continue; this.voices.set(kind, (v = { g: 0, to: 0, step: 0 })); }
      v.to = to; v.step = (to - v.g) / n;
    }
  }

  get playing() { return [...this.voices.keys()]; }

  render(L: Float32Array, R: Float32Array) {
    const n = L.length;
    if (this.l.length !== n) { this.l = new Float32Array(n); this.r = new Float32Array(n); }
    const { l, r } = this;
    L.fill(0); R.fill(0);
    for (const [kind, v] of this.voices) {
      v.render ??= this.make(kind, this.sr, this.rand);
      v.render(l, r);
      for (let i = 0; i < n; i++) {
        if (v.g !== v.to) { v.g += v.step; if ((v.step > 0) === (v.g > v.to)) v.g = v.to; }
        L[i] += v.g * l[i]; R[i] += v.g * r[i];
      }
      if (!v.g && !v.to) this.voices.delete(kind);
    }
    for (let i = 0; i < n; i++) { L[i] = limit(L[i]); R[i] = limit(R[i]); }
  }
}
