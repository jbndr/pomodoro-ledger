import { describe, expect, it } from "vitest";
import { flagOn } from "./flags";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("flagOn", () => {
  it("is on when unset or on, off when off", () => {
    expect(flagOn(undefined, at(2026, 10, 5))).toBe(true);
    expect(flagOn("", at(2026, 10, 5))).toBe(true);
    expect(flagOn(" On ", at(2026, 10, 5))).toBe(true);
    expect(flagOn("off", at(2026, 10, 5))).toBe(false);
  });

  it("turns on from a start day", () => {
    expect(flagOn("2026-12-01", at(2026, 11, 30, 23))).toBe(false);
    expect(flagOn("2026-12-01", at(2026, 12, 1, 0))).toBe(true);
    expect(flagOn("2026-12-01", at(2027, 3, 1))).toBe(true);
  });

  it("stays on through the last day of a window", () => {
    const w = "2026-12-01..2027-01-15";
    expect(flagOn(w, at(2026, 11, 30))).toBe(false);
    expect(flagOn(w, at(2026, 12, 24))).toBe(true);
    expect(flagOn(w, at(2027, 1, 15, 23))).toBe(true);
    expect(flagOn(w, at(2027, 1, 16, 0))).toBe(false);
  });

  it("treats anything unreadable as off", () => {
    expect(flagOn("december", at(2026, 12, 5))).toBe(false);
    expect(flagOn("2026-12-01..soon", at(2026, 12, 5))).toBe(false);
  });
});
