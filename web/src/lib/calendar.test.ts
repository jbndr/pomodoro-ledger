import { describe, expect, it } from "vitest";
import { calMove, monthGrid, monthOf, stepMonth, weekStartOf } from "./calendar";

const OCT = new Date(2026, 9, 1).getTime();

describe("monthGrid", () => {
  it("shows six full weeks starting on Monday", () => {
    const days = monthGrid(OCT, 1);
    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ key: "2026-09-28", date: 28, out: true });
    expect(days[3]).toMatchObject({ key: "2026-10-01", date: 1, out: false });
    expect(days[33]).toMatchObject({ key: "2026-10-31", out: false });
    expect(days[41]).toMatchObject({ key: "2026-11-08", out: true });
  });
  it("starts on Sunday where weeks do", () => {
    const days = monthGrid(OCT, 0);
    expect(days[0].key).toBe("2026-09-27");
    expect(days[4].key).toBe("2026-10-01");
  });
  it("starts on the 1st when the month does", () => {
    expect(monthGrid(new Date(2026, 5, 1).getTime(), 1)[0].key).toBe("2026-06-01");
  });
});

describe("months", () => {
  it("finds the first of the month and steps across years", () => {
    expect(monthOf(new Date(2026, 9, 17, 13).getTime())).toBe(OCT);
    expect(stepMonth(OCT, 3)).toBe(new Date(2027, 0, 1).getTime());
    expect(stepMonth(OCT, -10)).toBe(new Date(2025, 11, 1).getTime());
  });
  it("reads the first weekday from the locale", () => {
    expect([0, 1, 6]).toContain(weekStartOf("en-US"));
    expect(weekStartOf("not a locale")).toBe(1);
  });
});

describe("calMove", () => {
  it.each([
    ["ArrowLeft", "2026-10-14"], ["ArrowRight", "2026-10-16"], ["ArrowUp", "2026-10-08"], ["ArrowDown", "2026-10-22"],
    ["PageUp", "2026-09-15"], ["PageDown", "2026-11-15"], ["Home", "2026-10-12"], ["End", "2026-10-18"],
  ])("%s from Thu 15 Oct goes to %s", (key, to) => {
    expect(calMove("2026-10-15", key, 1)).toBe(to);
  });
  it("keeps month steps inside short months", () => {
    expect(calMove("2026-01-31", "PageDown", 1)).toBe("2026-02-28");
  });
  it("uses the locale's week for Home and End", () => {
    expect(calMove("2026-10-15", "Home", 0)).toBe("2026-10-11");
    expect(calMove("2026-10-15", "End", 0)).toBe("2026-10-17");
  });
  it("ignores other keys", () => {
    expect(calMove("2026-10-15", "Enter", 1)).toBeNull();
  });
});
