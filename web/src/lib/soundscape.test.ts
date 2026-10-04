import { describe, expect, it } from "vitest";
import { DUCK, FADE_IN, FADE_OUT, PHASE_FADE, previewRamp, QUICK, scapeOf, scapeRamp, scapeVolume, swapRamp } from "./soundscape";

describe("scapeOf", () => {
  it("knows the four soundscapes", () => {
    for (const k of ["rain", "ocean", "fire", "brown"]) expect(scapeOf(k)).toBe(k);
  });
  it("plays ocean for a stored café", () => {
    expect(scapeOf("cafe")).toBe("ocean");
  });
  it("reads anything else as off", () => {
    for (const v of [undefined, null, "", "off", "Rain", "Cafe", "white", 3, {}]) expect(scapeOf(v)).toBeNull();
  });
});

describe("scapeVolume", () => {
  it("clamps and rounds to 0–100", () => {
    expect(scapeVolume("35")).toBe(35);
    expect(scapeVolume(62.6)).toBe(63);
    expect(scapeVolume(-4)).toBe(0);
    expect(scapeVolume("140")).toBe(100);
  });
  it("defaults to 40 when unset or unreadable", () => {
    for (const v of [undefined, null, "", "loud"]) expect(scapeVolume(v)).toBe(40);
  });
});

describe("scapeRamp", () => {
  it("fades in over the full time from silence", () => {
    expect(scapeRamp(0, 0.5)).toEqual([[FADE_IN, 0.5]]);
  });
  it("finishes a cut-short fade in, in proportion", () => {
    expect(scapeRamp(0.25, 0.5)).toEqual([[FADE_IN / 2, 0.5]]);
  });
  it("fades out over the full time, wherever it starts", () => {
    expect(scapeRamp(0.5, 0)).toEqual([[FADE_OUT, 0]]);
    expect(scapeRamp(0.1, 0)).toEqual([[FADE_OUT, 0]]);
  });
  it("follows a volume change quickly", () => {
    expect(scapeRamp(0.5, 0.8, { quick: true })).toEqual([[QUICK, 0.8]]);
    expect(scapeRamp(0.5, 0.2, { quick: true })).toEqual([[QUICK, 0.2]]);
  });
  it("holds until the phase ends, then fades out gently", () => {
    expect(scapeRamp(0, 0.5, { fadeAt: 60 })).toEqual([[FADE_IN, 0.5], [60, 0.5], [60 + PHASE_FADE, 0]]);
    expect(PHASE_FADE).toBeGreaterThan(FADE_OUT);
  });
  it("cuts the fade in short when the phase ends first", () => {
    const r = scapeRamp(0, 0.6, { fadeAt: 1 });
    expect(r[0][0]).toBe(1);
    expect(r[0][1]).toBeCloseTo(0.2);
    expect(r[1]).toEqual([1 + PHASE_FADE, 0]);
    expect(scapeRamp(0, 0.6, { fadeAt: -5 })[1]).toEqual([PHASE_FADE, 0]);
  });
  it("dips under the bell and comes back", () => {
    const r = scapeRamp(0.5, 0.5, { duckAt: 30 });
    expect(r[1]).toEqual([30, 0.5]);
    expect(Math.min(...r.map(([, g]) => g))).toBeCloseTo(0.5 * DUCK);
    expect(r[r.length - 1][1]).toBe(0.5);
  });
  it("always moves forward in time", () => {
    for (const r of [scapeRamp(0, 1, { fadeAt: 2.9 }), scapeRamp(0.3, 1, { duckAt: 4 }), scapeRamp(1, 0.2), scapeRamp(0, 0.4, { fadeAt: 0 })]) {
      r.forEach(([t], i) => { expect(t).toBeGreaterThan(i ? r[i - 1][0] : 0); });
    }
  });
});

describe("swapRamp", () => {
  const forward = (r: [number, number][]) => r.forEach(([t], i) => { expect(t).toBeGreaterThan(i ? r[i - 1][0] : 0); });

  it("fades out at the phase-end pace, swaps in silence, then fades the next mix in", () => {
    const { at, ramp } = swapRamp(0.5, 0.5, 0.3);
    expect(at).toBe(PHASE_FADE);
    expect(ramp).toEqual([[PHASE_FADE, 0], [PHASE_FADE + FADE_IN, 0.3]]);
  });
  it("picks up a phase-end fade already under way", () => {
    expect(swapRamp(0.25, 0.5, 0.3).at).toBe(PHASE_FADE / 2);
    expect(swapRamp(0.2, 0.5, 0.3, {}, FADE_OUT).at).toBeCloseTo(FADE_OUT * 0.4);
  });
  it("swaps straight away from silence", () => {
    const { at, ramp } = swapRamp(0, 0.5, 0.4);
    expect(at).toBe(0);
    expect(ramp).toEqual([[FADE_IN, 0.4]]);
  });
  it("keeps the next phase's own fade and duck in place", () => {
    const fade = swapRamp(0.5, 0.5, 0.4, { fadeAt: 300 });
    expect(fade.ramp.slice(-2)).toEqual([[300, 0.4], [300 + PHASE_FADE, 0]]);
    const duck = swapRamp(0.5, 0.5, 0.4, { duckAt: 300 });
    expect(duck.ramp[2]).toEqual([300, 0.4]);
    expect(Math.min(...duck.ramp.slice(1).map(([, g]) => g))).toBeCloseTo(0.4 * DUCK);
    forward(fade.ramp); forward(duck.ramp);
  });
});

describe("previewRamp", () => {
  it("rises, holds and ends silent", () => {
    const r = previewRamp(0.3);
    expect(r[0]).toEqual([1, 0.3]);
    expect(r[r.length - 1][1]).toBe(0);
  });
  it("glides quickly when a preview is already playing", () => {
    expect(previewRamp(0.3, 0.2)[0]).toEqual([QUICK, 0.3]);
  });
});
