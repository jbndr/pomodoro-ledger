import { describe, expect, it } from "vitest";
import { FACES } from "./faces";
import { tickSamples } from "./tickSound";

const SR = 48000;
const peak = (s: Float32Array, from = 0, to = s.length) => s.subarray(from, to).reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("tickSamples", () => {
  it("gives half a second for every face, well below clipping", () => {
    for (const [face] of FACES) {
      const s = tickSamples(face, SR);
      expect(s.length).toBe(SR / 2);
      expect(peak(s)).toBeGreaterThan(0.05);
      expect(peak(s)).toBeLessThan(0.5);
    }
  });

  it("sounds different for each face", () => {
    const sums = FACES.map(([face]) => tickSamples(face, SR).reduce((a, x) => a + Math.abs(x), 0).toFixed(3));
    expect(new Set(sums).size).toBe(FACES.length);
  });

  it("lands the split-flap clack with the falling leaf, not on the second", () => {
    const s = tickSamples("flap", SR);
    expect(peak(s, 0, SR * 0.14)).toBe(0);
    expect(peak(s, SR * 0.15, SR * 0.17)).toBeGreaterThan(0.05);
  });

  it("is the same every time", () => {
    expect(tickSamples("nixie", SR)).toEqual(tickSamples("nixie", SR));
  });
});
