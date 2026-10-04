import { describe, expect, it } from "vitest";
import { askOf, clock, mateClock, mateProgress, normCode, othersOf, type Member, type MateTimer } from "./room";

const now = 1_000_000;
const running = (left: number, total = 1500000): MateTimer => ({ mode: "focus", status: "running", end: now + left, rem: left, total });
const paused = (rem: number, total = 300000): MateTimer => ({ mode: "short", status: "paused", rem, total });
const idle = (total = 900000): MateTimer => ({ mode: "long", status: "idle", rem: total, total });
const member = (id: string, s: MateTimer | null = null, owner = false): Member => ({ id, name: id.toUpperCase(), owner, s });

describe("normCode", () => {
  it("uppercases and drops everything but letters and digits", () => {
    expect(normCode("ab-c 234")).toBe("ABC234");
    expect(normCode(" x9.y8 ")).toBe("X9Y8");
  });
  it("keeps at most six characters", () => {
    expect(normCode("abcdefgh")).toBe("ABCDEF");
  });
  it("copes with missing values", () => {
    expect(normCode("")).toBe("");
    expect(normCode(null)).toBe("NULL");
  });
});

describe("othersOf", () => {
  it("leaves out this member and keeps the room's order", () => {
    const ms = [member("c"), member("me"), member("a")];
    expect(othersOf(ms, "me").map((m) => m.id)).toEqual(["c", "a"]);
  });
  it("keeps everyone before the room has said who this member is", () => {
    expect(othersOf([member("a"), member("b")], null)).toHaveLength(2);
  });
});

describe("clock", () => {
  it("pads minutes and seconds", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(65)).toBe("01:05");
    expect(clock(1500)).toBe("25:00");
  });
});

describe("mateClock", () => {
  it("counts down to the end while running, rounding up", () => {
    expect(mateClock(running(600000), now)).toBe("10:00");
    expect(mateClock(running(59001), now)).toBe("01:00");
  });
  it("never shows negative time once the end has passed", () => {
    expect(mateClock(running(-5000), now)).toBe("00:00");
  });
  it("shows the frozen time while paused", () => {
    expect(mateClock(paused(125000), now)).toBe("02:05");
  });
});

describe("mateProgress", () => {
  it("is empty and ready for an idle or unknown timer", () => {
    expect(mateProgress(null, now)).toEqual({ deg: "0deg", title: "Ready to focus" });
    expect(mateProgress(idle(), now)).toEqual({ deg: "0deg", title: "Ready to focus" });
  });
  it("fills the ring with the share of the phase that's done", () => {
    expect(mateProgress(running(375000, 1500000), now)).toEqual({ deg: "270deg", title: "75% complete" });
    expect(mateProgress(paused(150000, 300000), now)).toEqual({ deg: "180deg", title: "50% complete" });
  });
  it("stays within a full ring", () => {
    expect(mateProgress(running(-1000), now).deg).toBe("360deg");
    expect(mateProgress(paused(400000, 300000), now)).toEqual({ deg: "0deg", title: "0% complete" });
  });
  it("treats a missing total as no progress", () => {
    expect(mateProgress({ ...paused(1000), total: 0 }, now)).toEqual({ deg: "0deg", title: "0% complete" });
  });
});

describe("askOf", () => {
  const ms = [member("me"), member("b", running(1000)), member("c")];
  it("is null without a request", () => {
    expect(askOf(null, ms, "me")).toBeNull();
  });
  it("tells this member's own request apart", () => {
    expect(askOf({ by: "me", yes: ["me"] }, ms, "me")).toEqual({ kind: "mine", by: ms[0], count: "1 of 3 accepted" });
  });
  it("knows when this member already accepted someone else's request", () => {
    expect(askOf({ by: "b", yes: ["b", "me"] }, ms, "me")).toMatchObject({ kind: "accepted", count: "2 of 3 accepted" });
  });
  it("asks the rest, naming whoever made the request", () => {
    expect(askOf({ by: "b", yes: ["b"] }, ms, "me")).toMatchObject({ kind: "asked", by: ms[1] });
    expect(askOf({ by: "gone", yes: [] }, ms, "me")).toMatchObject({ kind: "asked", by: null, count: "0 of 3 accepted" });
  });
});
