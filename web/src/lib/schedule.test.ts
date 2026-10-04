import { describe, expect, it } from "vitest";
import { clockIn, dayIn, daysIn, daysText, isLive, nextSession, offsetAt, readTimes, scheduleOf, sessionCode, zoned } from "./schedule";

const MIN = 60000, HOUR = 60 * MIN;
const berlin = { tz: "Europe/Berlin", days: [1, 2, 3, 4, 5], from: 9 * 60, to: 12 * 60 };
const at = (iso: string) => Date.parse(iso);

describe("zoned", () => {
  it("turns a wall-clock time into an instant on both sides of DST", () => {
    expect(zoned(2026, 10, 5, 9 * 60, "Europe/Berlin")).toBe(at("2026-10-05T07:00:00Z"));
    expect(zoned(2026, 10, 26, 9 * 60, "Europe/Berlin")).toBe(at("2026-10-26T08:00:00Z"));
    expect(zoned(2026, 10, 5, 14 * 60, "America/New_York")).toBe(at("2026-10-05T18:00:00Z"));
  });
  it("moves a time skipped by DST an hour later", () => {
    expect(zoned(2026, 3, 29, 2 * 60 + 30, "Europe/Berlin")).toBe(at("2026-03-29T01:30:00Z"));
  });
  it("reads offsets", () => {
    expect(offsetAt(at("2026-07-01T12:00:00Z"), "Europe/Berlin")).toBe(2 * HOUR);
    expect(offsetAt(at("2026-12-01T12:00:00Z"), "Asia/Kolkata")).toBe(5.5 * HOUR);
  });
});

describe("nextSession", () => {
  it("finds the session running now", () => {
    const now = at("2026-10-05T08:15:00Z");
    const o = nextSession(berlin, now);
    expect(o).toEqual({ start: at("2026-10-05T07:00:00Z"), end: at("2026-10-05T10:00:00Z") });
    expect(isLive(o, now)).toBe(true);
  });
  it("skips to the next listed day once today's window is over", () => {
    expect(nextSession(berlin, at("2026-10-09T10:00:00Z"))!.start).toBe(at("2026-10-12T07:00:00Z"));
    expect(isLive(nextSession(berlin, at("2026-10-09T10:00:00Z")), at("2026-10-09T10:00:00Z"))).toBe(false);
  });
  it("keeps the wall-clock time across a DST change", () => {
    expect(nextSession(berlin, at("2026-10-24T12:00:00Z"))!.start).toBe(at("2026-10-26T08:00:00Z"));
  });
  it("uses the creator's day, not UTC's", () => {
    const tokyo = { tz: "Asia/Tokyo", days: [2], from: 7 * 60, to: 9 * 60 };
    expect(nextSession(tokyo, at("2026-10-05T20:00:00Z"))!.start).toBe(at("2026-10-05T22:00:00Z"));
  });
  it("returns null without days", () => {
    expect(nextSession({ ...berlin, days: [] }, Date.now())).toBeNull();
  });
});

describe("sessionCode", () => {
  it("is the same for everyone in a session and new each day", () => {
    const a = nextSession(berlin, at("2026-10-05T07:30:00Z"))!, b = nextSession(berlin, at("2026-10-05T09:59:00Z"))!;
    const c = nextSession(berlin, at("2026-10-05T10:00:00Z"))!;
    expect(sessionCode("K7Q", a.start)).toBe(sessionCode("K7Q", b.start));
    expect(sessionCode("K7Q", c.start)).not.toBe(sessionCode("K7Q", a.start));
    expect(sessionCode("K7Q", a.start)).toMatch(/^LK7Q[A-Z2-9]{2}$/);
  });
  it("reads the schedule back", () => {
    expect(scheduleOf(sessionCode("K7Q", Date.now()))).toBe("K7Q");
    expect(scheduleOf("OPENPA")).toBeNull();
    expect(scheduleOf("LK7Q0A")).toBeNull();
  });
});

describe("readTimes", () => {
  it("accepts half-hour windows up to 8 hours", () => {
    expect(readTimes({ tz: "Europe/Berlin", days: [4, 2, 2], from: 840, to: 960 })).toEqual({ tz: "Europe/Berlin", days: [2, 4], from: 840, to: 960 });
    expect(readTimes({ tz: "UTC", days: [0], from: 0, to: 480 })).not.toBeNull();
  });
  it("rejects anything else", () => {
    const ok = { tz: "Europe/Berlin", days: [1], from: 540, to: 720 };
    for (const bad of [
      { ...ok, tz: "Mars/Olympus" }, { ...ok, tz: 4 }, { ...ok, days: [] }, { ...ok, days: [7] }, { ...ok, days: [1.5] }, { ...ok, days: "1" },
      { ...ok, from: 545 }, { ...ok, to: 540 }, { ...ok, from: 0, to: 510 }, { ...ok, to: 1470 }, { ...ok, from: "540" },
    ]) expect(readTimes(bad)).toBeNull();
  });
});

describe("labels", () => {
  const now = at("2026-10-05T10:30:00Z");
  it("shows the day and time in the viewer's zone", () => {
    const start = at("2026-10-06T07:00:00Z");
    expect([dayIn(start, now, "Europe/Berlin"), clockIn(start, "Europe/Berlin")]).toEqual(["Tomorrow", "09:00"]);
    expect([dayIn(start, now, "America/Los_Angeles"), clockIn(start, "America/Los_Angeles")]).toEqual(["Tomorrow", "00:00"]);
    expect(dayIn(start, now, "Pacific/Honolulu")).toBe("Today");
    expect(dayIn(at("2026-10-08T12:00:00Z"), now, "UTC")).toBe("Thu");
  });
  it("names the days sessions fall on where the viewer is", () => {
    const evening = { tz: "America/New_York", days: [2, 4], from: 20 * 60, to: 22 * 60 };
    expect(daysText(daysIn(evening, now, "America/New_York"))).toBe("Tue, Thu");
    expect(daysText(daysIn(evening, now, "Europe/Berlin"))).toBe("Wed, Fri");
  });
  it("names common sets of days", () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(daysText([6, 0])).toBe("Weekends");
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(daysText([3])).toBe("Every Wed");
    expect(daysText([0, 1, 5])).toBe("Mon, Fri, Sun");
  });
});
