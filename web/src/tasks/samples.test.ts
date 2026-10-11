import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSamples, sampleBreaks } from "./samples";

afterEach(() => vi.useRealTimers());

describe("sampleBreaks", () => {
  it("starts each break as a demo round ends and never overlaps a round", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 12));
    const tasks = makeSamples(true), breaks = sampleBreaks(tasks);
    const rounds = [...tasks.values()].flatMap((t) => (t.sessions || []).map((s) => ({ from: s.at - (s.ms || 0), to: s.at })));
    expect(breaks.length).toBeGreaterThan(10);
    expect(breaks.some((b) => b.long)).toBe(true);
    for (const b of breaks) {
      expect(b.to - b.from).toBeGreaterThanOrEqual(2 * 60_000);
      expect(rounds.some((r) => r.to === b.from)).toBe(true);
      expect(rounds.some((r) => r.from < b.to && r.to > b.from)).toBe(false);
    }
  });
});
