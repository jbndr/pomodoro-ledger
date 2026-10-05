import { describe, expect, it } from "vitest";
import type { Task } from "./tasks";
import { arcOffset, CIRCUMFERENCE, clock, clockLabel, extraBreakMin, fraction, knobAt, litTicks, modeLabel, roundDots, startLabel, TICKS } from "./timer";

describe("clock", () => {
  it("pads minutes and seconds", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(25 * 60)).toBe("25:00");
    expect(clock(61)).toBe("01:01");
  });
  it("lets minutes grow past two digits", () => expect(clock(180 * 60)).toBe("180:00"));
  it("reads out minutes and seconds", () => expect(clockLabel(125)).toBe("2 minutes 5 seconds remaining"));
});

describe("dial geometry", () => {
  it("clamps the fraction left", () => {
    expect(fraction(30, 60)).toBe(0.5);
    expect(fraction(-5, 60)).toBe(0);
    expect(fraction(90, 60)).toBe(1);
  });
  it("hides the arc as time runs out", () => {
    expect(arcOffset(1)).toBe("0.00");
    expect(arcOffset(0)).toBe(CIRCUMFERENCE.toFixed(2));
    expect(arcOffset(0.5)).toBe((CIRCUMFERENCE / 2).toFixed(2));
  });
  it("puts the knob at the end of the arc, clockwise from the top", () => {
    expect(knobAt(1)).toEqual({ cx: "150.00", cy: "38.00" });
    expect(knobAt(0.25)).toEqual({ cx: "262.00", cy: "150.00" });
    expect(knobAt(0.5)).toEqual({ cx: "150.00", cy: "262.00" });
  });
  it("lights a tick for every started sixtieth left", () => {
    expect(litTicks(1)).toBe(60);
    expect(litTicks(0)).toBe(0);
    expect(litTicks(0.501)).toBe(31);
  });
  it("draws 60 ticks with a longer one every five", () => {
    expect(TICKS).toHaveLength(60);
    expect(TICKS.filter((t) => t.major)).toHaveLength(12);
    expect(TICKS[0]).toEqual({ major: true, x1: "150.00", y1: "22.00", x2: "150.00", y2: "8.00" });
    expect(TICKS[15]).toMatchObject({ major: true, x1: "278.00", y1: "150.00" });
    expect(TICKS[1].major).toBe(false);
  });
});

describe("labels", () => {
  it("counts focus cycles toward the long break", () => {
    expect(modeLabel("focus", 0, 4)).toBe("Focus · 1 of 4");
    expect(modeLabel("focus", 3, 4)).toBe("Focus · 4 of 4");
    expect(modeLabel("focus", 9, 4)).toBe("Focus · 4 of 4");
    expect(modeLabel("short", 2, 4)).toBe("Short break");
    expect(modeLabel("long", 4, 4)).toBe("Long break");
  });
  it("names the start button after what it does", () => {
    expect(startLabel("idle")).toBe("Start");
    expect(startLabel("running")).toBe("Pause");
    expect(startLabel("paused")).toBe("Resume");
  });
});

describe("roundDots", () => {
  it("marks finished rounds and the one in progress", () => {
    expect(roundDots("focus", 0, 4)).toEqual(["now", "", "", ""]);
    expect(roundDots("focus", 2, 4)).toEqual(["done", "done", "now", ""]);
  });
  it("shows no current round during a short break", () => expect(roundDots("short", 1, 4)).toEqual(["done", "", "", ""]));
  it("fills every round during an earned long break", () => expect(roundDots("long", 4, 4)).toEqual(["done", "done", "done", "done"]));
  it("keeps the place in the cycle during an early long break", () => expect(roundDots("long", 2, 4)).toEqual(["done", "done", "", ""]));
  it("caps the index at the round count", () => expect(roundDots("focus", 9, 3)).toEqual(["done", "done", "done"]));
});

describe("extraBreakMin", () => {
  it("adds about a minute of break per five minutes past the bell, up to fifteen", () => {
    expect(extraBreakMin(0)).toBe(0);
    expect(extraBreakMin(2 * 60_000)).toBe(0);
    expect(extraBreakMin(3 * 60_000)).toBe(1);
    expect(extraBreakMin(12 * 60_000)).toBe(2);
    expect(extraBreakMin(4 * 3600_000)).toBe(15);
  });
});
