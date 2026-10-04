import { describe, expect, it } from "vitest";
import { DUCK, FADE_IN, FADE_OUT, previewRamp, QUICK, scapeOf, scapePlan, scapeRamp, scapeVolume } from "./soundscape";

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

describe("scapePlan", () => {
  const now = 1_000_000, endsAt = now + 25 * 60_000;
  const focus = { mode: "focus" as const, status: "running" as const, endsAt };

  it("plays during a running focus round and fades out at its end", () => {
    expect(scapePlan({ soundscape: "rain", soundscapeVolume: 50 }, focus, now)).toEqual({ kind: "rain", gain: 0.5, fadeAt: endsAt, duckAt: 0 });
  });
  it("uses the default volume when unset", () => {
    expect(scapePlan({ soundscape: "fire" }, focus, now)?.gain).toBe(0.4);
  });
  it("plays ocean for settings saved with café", () => {
    expect(scapePlan({ soundscape: "cafe", soundscapeVolume: 30 }, focus, now)).toMatchObject({ kind: "ocean", gain: 0.3 });
  });
  it("stays quiet when off, muted, paused, idle or past the end", () => {
    expect(scapePlan({}, focus, now)).toBeNull();
    expect(scapePlan({ soundscape: "off" }, focus, now)).toBeNull();
    expect(scapePlan({ soundscape: "rain", soundscapeVolume: 0 }, focus, now)).toBeNull();
    expect(scapePlan({ soundscape: "rain" }, { ...focus, status: "paused" }, now)).toBeNull();
    expect(scapePlan({ soundscape: "rain" }, { ...focus, status: "idle" }, now)).toBeNull();
    expect(scapePlan({ soundscape: "rain" }, focus, endsAt)).toBeNull();
  });
  it("stays quiet during breaks unless asked", () => {
    expect(scapePlan({ soundscape: "brown" }, { ...focus, mode: "short" }, now)).toBeNull();
    expect(scapePlan({ soundscape: "brown" }, { ...focus, mode: "long" }, now)).toBeNull();
    expect(scapePlan({ soundscape: "brown", soundscapeBreaks: true }, { ...focus, mode: "short" }, now)?.kind).toBe("brown");
  });
  it("plays on across phases when breaks are included, dipping under the bell if sounds are on", () => {
    expect(scapePlan({ soundscape: "brown", soundscapeBreaks: true, sound: true }, focus, now)).toMatchObject({ fadeAt: 0, duckAt: endsAt });
    expect(scapePlan({ soundscape: "brown", soundscapeBreaks: true, sound: false }, focus, now)).toMatchObject({ fadeAt: 0, duckAt: 0 });
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
  it("holds until the phase ends, then fades out", () => {
    expect(scapeRamp(0, 0.5, { fadeAt: 60 })).toEqual([[FADE_IN, 0.5], [60, 0.5], [60 + FADE_OUT, 0]]);
  });
  it("cuts the fade in short when the phase ends first", () => {
    const r = scapeRamp(0, 0.6, { fadeAt: 1 });
    expect(r[0][0]).toBe(1);
    expect(r[0][1]).toBeCloseTo(0.2);
    expect(r[1]).toEqual([1 + FADE_OUT, 0]);
    expect(scapeRamp(0, 0.6, { fadeAt: -5 })[1]).toEqual([FADE_OUT, 0]);
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

describe("previewRamp", () => {
  it("rises, holds and ends silent", () => {
    const r = previewRamp(0.3);
    expect(r[0][1]).toBe(0.3);
    expect(r[r.length - 1][1]).toBe(0);
  });
});
