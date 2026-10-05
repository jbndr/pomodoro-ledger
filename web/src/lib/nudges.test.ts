import { describe, expect, it } from "vitest";
import { logNudge, nudgesOf, pickNudge, PRESET_NUDGES, type Nudge } from "./nudges";

const HOUR = 3_600_000;

describe("pickNudge", () => {
  it("offers the eyes nudge on a short break, and stretching too on a long one", () => {
    expect(pickNudge(PRESET_NUDGES, {}, "short", HOUR)?.id).toBe("eyes");
    expect(pickNudge(PRESET_NUDGES, { eyes: 5 }, "long", HOUR)?.id).toBe("stretch");
  });
  it("rotates to the one shown longest ago", () => {
    const list: Nudge[] = [{ id: "a", text: "A", every: "break", on: true }, { id: "b", text: "B", every: "break", on: true }];
    expect(pickNudge(list, { a: 200, b: 100 }, "short", 300)?.id).toBe("b");
    expect(pickNudge(list, { a: 100, b: 200 }, "short", 300)?.id).toBe("a");
  });
  it("waits an hour between hourly nudges and skips ones that are off or empty", () => {
    const water: Nudge = { id: "w", text: "Water", every: "hour", on: true };
    expect(pickNudge([water], { w: HOUR }, "short", HOUR + 10)).toBeNull();
    expect(pickNudge([water], { w: HOUR }, "short", 2 * HOUR)?.id).toBe("w");
    expect(pickNudge([{ ...water, on: false }], {}, "short", 2 * HOUR)).toBeNull();
    expect(pickNudge([{ ...water, text: "  " }], {}, "short", 2 * HOUR)).toBeNull();
  });
});

describe("nudgesOf and logNudge", () => {
  it("falls back to the presets", () => {
    expect(nudgesOf(undefined)).toBe(PRESET_NUDGES);
    expect(nudgesOf([])).toBe(PRESET_NUDGES);
  });
  it("counts per day and keeps 60 days", () => {
    expect(logNudge({ "2026-10-05": 2 }, "2026-10-05")).toEqual({ "2026-10-05": 3 });
    const many = Object.fromEntries([...Array(70)].map((_, i) => ["2026-07-" + String(i).padStart(2, "0"), 1]));
    expect(Object.keys(logNudge(many, "2026-10-06")).length).toBe(60);
  });
});
