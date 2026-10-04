import { describe, expect, it } from "vitest";
import {
  addBubble, askOf, bubbleNames, clock, liveBubbles, mateClock, mateProgress, normCode, othersOf, REACT_BURST, REACT_EVERY_MS, REACT_LIFE_MS, REACT_MAX, REACTIONS, takeToken, tokenIn,
  type Bubble, type Bucket, type Member, type MateTimer,
} from "./room";

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

describe("takeToken", () => {
  it("allows a short burst, then waits for the bucket to refill", () => {
    let b: Bucket | null = null;
    for (let i = 0; i < REACT_BURST; i++) b = takeToken(b, now) ?? b;
    expect(takeToken(b, now)).toBeNull();
    expect(tokenIn(b, now)).toBe(REACT_EVERY_MS);
    expect(tokenIn(b, now + REACT_EVERY_MS / 2)).toBe(REACT_EVERY_MS / 2);
    expect(takeToken(b, now + REACT_EVERY_MS - 1)).toBeNull();
    expect(takeToken(b, now + REACT_EVERY_MS)).toEqual({ n: 0, at: now + REACT_EVERY_MS });
  });
  it("never saves up more than a burst", () => {
    const b = takeToken({ n: 0, at: now - 3_600_000 }, now);
    expect(b).toEqual({ n: REACT_BURST - 1, at: now });
    expect(tokenIn(null, now)).toBe(0);
  });
  it("stays within the room's limit of 5 at once and one every 4 seconds", () => {
    let b: Bucket | null = null, sent = 0;
    for (let t = 0; t <= 60_000; t += 100) { const next = takeToken(b, now + t); if (next) { b = next; sent++; } }
    expect(sent).toBeLessThanOrEqual(5 + 60_000 / 4000);
    expect(REACT_BURST).toBeLessThanOrEqual(5);
  });
});

describe("addBubble", () => {
  it("stacks different reactions, newest last", () => {
    let list = addBubble([], "👋", "Ana", now);
    list = addBubble(list, "🔥", "Ben", now + 100);
    expect(list.map((b) => [b.e, b.names])).toEqual([["👋", ["Ana"]], ["🔥", ["Ben"]]]);
    expect(list[0].key).not.toBe(list[1].key);
  });
  it("folds a matching reaction into the bubble still showing", () => {
    let list = addBubble([], "🎉", "Ana", now);
    const key = list[0].key;
    list = addBubble(list, "🎉", "Ben", now + 1000);
    list = addBubble(list, "🎉", "Ana", now + 2000);
    expect(list).toEqual([{ key, e: "🎉", names: ["Ana", "Ben"], n: 3, at: now + 2000 }]);
  });
  it("starts fresh once the old bubble is gone", () => {
    let list = addBubble([], "🎉", "Ana", now);
    list = addBubble(list, "🎉", "Ben", now + REACT_LIFE_MS);
    expect(list.map((b) => [b.names, b.n])).toEqual([[["Ben"], 1]]);
  });
  it("keeps only the newest few on screen", () => {
    let list: Bubble[] = [];
    for (const e of REACTIONS) list = addBubble(list, e, "Ana", now);
    expect(list.map((b) => b.e)).toEqual(REACTIONS.slice(-REACT_MAX));
  });
  it("drops bubbles that have run their time", () => {
    const list = addBubble(addBubble([], "👋", "Ana", now), "☕", "Ben", now + 3000);
    expect(liveBubbles(list, now + REACT_LIFE_MS).map((b) => b.e)).toEqual(["☕"]);
  });
});

describe("bubbleNames", () => {
  it("names one or two people, then counts the rest", () => {
    expect(bubbleNames(["Ana"])).toBe("Ana");
    expect(bubbleNames(["Ana", "Ben"])).toBe("Ana and Ben");
    expect(bubbleNames(["Ana", "Ben", "Cy"])).toBe("Ana, Ben and 1 other");
    expect(bubbleNames(["Ana", "Ben", "Cy", "Di"])).toBe("Ana, Ben and 2 others");
  });
});
