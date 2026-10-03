import { describe, expect, it } from "vitest";
import { rovingIndex, syncCopy, tickPace, tickVolume, wholeIn, workdayEnd } from "./settings";

describe("wholeIn", () => {
  it("rounds to a whole number inside the range", () => {
    expect(wholeIn("25", 1, 120)).toBe(25);
    expect(wholeIn("24.6", 1, 120)).toBe(25);
    expect(wholeIn("1", 1, 60)).toBe(1);
    expect(wholeIn("90", 1, 90)).toBe(90);
  });
  it("rejects empty, zero, non-numbers and anything out of range", () => {
    expect(wholeIn("", 1, 120)).toBeNull();
    expect(wholeIn("0", 1, 120)).toBeNull();
    expect(wholeIn("abc", 1, 120)).toBeNull();
    expect(wholeIn("121", 1, 120)).toBeNull();
    expect(wholeIn("1", 2, 12)).toBeNull();
    expect(wholeIn("-3", 1, 30)).toBeNull();
  });
  it("judges the rounded value", () => {
    expect(wholeIn("120.4", 1, 120)).toBe(120);
    expect(wholeIn("120.5", 1, 120)).toBeNull();
    expect(wholeIn("0.4", 1, 120)).toBeNull();
  });
});

describe("ticking", () => {
  it("clamps the volume to 0–100", () => {
    expect(tickVolume("35")).toBe(35);
    expect(tickVolume(-4)).toBe(0);
    expect(tickVolume("140")).toBe(100);
  });
  it("only allows paces of 1, 2 or 4 seconds", () => {
    expect(tickPace("1")).toBe(1);
    expect(tickPace(4)).toBe(4);
    expect(tickPace("3")).toBe(2);
    expect(tickPace("")).toBe(2);
  });
});

describe("workdayEnd", () => {
  it("keeps a HH:MM time and clears anything else", () => {
    expect(workdayEnd("17:30")).toBe("17:30");
    expect(workdayEnd("")).toBe("");
    expect(workdayEnd("7:30")).toBe("");
    expect(workdayEnd("17:30:00")).toBe("");
  });
});

describe("rovingIndex", () => {
  it("wraps around with the arrow keys", () => {
    expect(rovingIndex("ArrowRight", 0, 4)).toBe(1);
    expect(rovingIndex("ArrowRight", 3, 4)).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(rovingIndex("ArrowLeft", 2, 4)).toBe(1);
  });
  it("jumps to the ends with Home and End", () => {
    expect(rovingIndex("Home", 2, 4)).toBe(0);
    expect(rovingIndex("End", 0, 4)).toBe(3);
  });
  it("ignores other keys", () => {
    expect(rovingIndex("ArrowDown", 1, 4)).toBe(-1);
    expect(rovingIndex("Tab", 1, 4)).toBe(-1);
  });
});

describe("syncCopy", () => {
  it("offers sign-in when signed out", () => {
    expect(syncCopy("signedout", false, "")).toMatchObject({ title: "Not signed in", acts: "signin", hint: "" });
  });
  it("shows the account and offers export while signed in", () => {
    for (const st of ["live", "offline", "connecting"] as const) {
      const c = syncCopy(st, false, "signed-in account");
      expect(c.acts).toBe("account");
      expect(c.detail).toContain("signed-in account");
      expect(c.hint).toMatch(/^The timer/);
    }
    expect(syncCopy("live", false, "signed-in account").title).toBe("Synced");
    expect(syncCopy("offline", false, "x").detail).toBe("Changes are saved here and sync when you're back online. x");
  });
  it("tells local-only and account-backed servers apart when sync is off", () => {
    expect(syncCopy("off", false, "")).toMatchObject({ title: "Saved in this browser", acts: "", hint: "" });
    expect(syncCopy("off", true, "")).toMatchObject({ title: "Synced to your account", acts: "", hint: "" });
  });
});
