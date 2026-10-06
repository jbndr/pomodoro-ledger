import { describe, expect, it } from "vitest";
import { daysPhrase, hoursPhrase, isDue, logNudge, nudgesOf, parseNudge, pickNudge, PRESET_NUDGES, scheduleLine, scheduleOf, whenPhrase, type Nudge, type NudgeContext } from "./nudges";

const HOUR = 3_600_000;
const MON_10 = new Date("2026-10-05T10:00:00").getTime();
const ctx = (focusMin = 0, breaks = 0): NudgeContext => ({ focusSince: () => focusMin * 60_000, breaksSince: () => breaks });
const nudge = (o: Partial<Nudge>): Nudge => ({ id: "x", text: "X", on: true, ...o });

describe("pickNudge", () => {
  it("offers the eyes nudge on a short break, and stretching too on a long one", () => {
    expect(pickNudge(PRESET_NUDGES, {}, "short", MON_10)?.id).toBe("eyes");
    expect(pickNudge(PRESET_NUDGES, { eyes: 5 }, "long", MON_10)?.id).toBe("stretch");
  });
  it("rotates to the one shown longest ago", () => {
    const list = [nudge({ id: "a" }), nudge({ id: "b" })];
    expect(pickNudge(list, { a: 200, b: 100 }, "short", MON_10)?.id).toBe("b");
    expect(pickNudge(list, { a: 100, b: 200 }, "short", MON_10)?.id).toBe("a");
  });
  it("skips nudges that are off or empty", () => {
    expect(pickNudge([nudge({ on: false })], {}, "short", MON_10)).toBeNull();
    expect(pickNudge([nudge({ text: "  " })], {}, "short", MON_10)).toBeNull();
  });
});

describe("isDue", () => {
  it("counts breaks since it last showed", () => {
    const n = nudge({ when: "breaks", every: "2" });
    expect(isDue(n, 0, "short", MON_10, ctx(0, 1))).toBe(false);
    expect(isDue(n, 0, "short", MON_10, ctx(0, 2))).toBe(true);
    expect(isDue(nudge({ every: "long" }), 0, "short", MON_10, ctx(0, 9))).toBe(false);
  });
  it("waits for enough focus", () => {
    const n = nudge({ when: "focus", minutes: 90 });
    expect(isDue(n, 0, "short", MON_10, ctx(75))).toBe(false);
    expect(isDue(n, 0, "short", MON_10, ctx(90))).toBe(true);
  });
  it("shows a set time in the first break after it, once", () => {
    const n = nudge({ when: "times", times: ["09:30", "15:00"] });
    expect(isDue(n, 0, "short", MON_10, ctx())).toBe(true);
    expect(isDue(n, MON_10 - 60_000, "short", MON_10, ctx())).toBe(false);
    expect(isDue(nudge({ when: "times", times: ["11:00"] }), 0, "short", MON_10, ctx())).toBe(false);
  });
  it("keeps to its days and hours", () => {
    expect(isDue(nudge({ days: [5, 6] }), 0, "short", MON_10, ctx())).toBe(false);
    expect(isDue(nudge({ between: true, from: "11:00", to: "17:00" }), 0, "short", MON_10, ctx())).toBe(false);
    expect(isDue(nudge({ between: true, from: "22:00", to: "11:00" }), 0, "short", MON_10, ctx())).toBe(true);
  });
  it("reads the rhythms from before schedules", () => {
    expect(scheduleOf(nudge({ every: "hour" }))).toMatchObject({ when: "focus", minutes: 60 });
    expect(scheduleOf(nudge({ every: "break" }))).toMatchObject({ when: "breaks", every: "1", days: [0, 1, 2, 3, 4, 5, 6] });
    expect(isDue(nudge({ every: "hour" }), MON_10 - HOUR, "short", MON_10, ctx(30))).toBe(false);
  });
});

describe("schedules in words", () => {
  it("summarises and phrases a schedule", () => {
    const s = scheduleOf(nudge({ when: "focus", minutes: 90, days: [0, 1, 2, 3, 4], between: true, from: "08:00", to: "19:00" }));
    expect(scheduleLine(s)).toBe("After 1 h 30 min of focus · Weekdays · 08:00–19:00");
    expect([whenPhrase(s), daysPhrase(s), hoursPhrase(s)]).toEqual(["after 1 h 30 min of focus", "on weekdays", "between 08:00–19:00"]);
    expect(daysPhrase(scheduleOf(nudge({ days: [0, 2] })))).toBe("on Mo, We");
  });
  it("reads a typed nudge", () => {
    expect(parseNudge("Do 10 push-ups every 2nd break on weekdays between 9 and 17")).toMatchObject({ text: "Do 10 push-ups", found: true, schedule: { when: "breaks", every: "2", days: [0, 1, 2, 3, 4], between: true, from: "09:00", to: "17:00" } });
    expect(parseNudge("drink water every 1.5h").schedule).toMatchObject({ when: "focus", minutes: 90 });
    expect(parseNudge("Stretch at 11 and 3pm").schedule).toMatchObject({ when: "times", times: ["11:00", "15:00"] });
    expect(parseNudge("Plank in long breaks")).toMatchObject({ text: "Plank", schedule: { when: "breaks", every: "long" } });
    expect(parseNudge("Call mum")).toMatchObject({ text: "Call mum", found: false, schedule: { when: "breaks", every: "1" } });
  });
});

describe("nudgesOf and logNudge", () => {
  it("falls back to the presets until the list is changed", () => {
    expect(nudgesOf(undefined)).toBe(PRESET_NUDGES);
    expect(nudgesOf([])).toEqual([]);
  });
  it("counts per day and keeps 60 days", () => {
    expect(logNudge({ "2026-10-05": 2 }, "2026-10-05")).toEqual({ "2026-10-05": 3 });
    const many = Object.fromEntries([...Array(70)].map((_, i) => ["2026-07-" + String(i).padStart(2, "0"), 1]));
    expect(Object.keys(logNudge(many, "2026-10-06")).length).toBe(60);
  });
});
