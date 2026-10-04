import { describe, expect, it } from "vitest";
import { breaksBetween, dropToken, hashToken, parseTitle } from "./quickEntry";

// Saturday, 3 October 2026.
const NOW = new Date(2026, 9, 3, 15, 30).getTime();
const parse = (raw: string, keep: string[] = []) => parseTitle(raw, keep, NOW);

describe("parseTitle", () => {
  it("reads a day and an estimate off the end of the title", () => {
    expect(parse("Call the accountant friday 2c")).toEqual({
      title: "Call the accountant",
      when: "2026-10-09",
      est: 2,
      tokens: [{ text: "friday", kind: "when", when: "2026-10-09" }, { text: "2c", kind: "est", est: 2 }],
    });
  });

  it.each([
    ["Expense report next week", "Expense report", "2026-10-05"],
    ["Draft memo 12.10.", "Draft memo", "2026-10-12"],
    ["Workshop am freitag", "Workshop", "2026-10-09"],
    ["Plan tomorrow", "Plan", "2026-10-04"],
    ["Write report today", "Write report", "today"],
  ])("%j → %j on %j", (raw, title, when) => {
    const p = parse(raw);
    expect(p.title).toBe(title);
    expect(p.when).toBe(when);
  });

  it("reads estimates written as x3 or 3 cycles", () => {
    expect(parse("Review PRs x3")).toMatchObject({ title: "Review PRs", est: 3, when: undefined });
    expect(parse("Review PRs 4 cycles")).toMatchObject({ title: "Review PRs", est: 4 });
  });

  it.each(["Call Tom", "Things to do", "Release 1.2", "tomorrow", "Buy a mon itor"])("leaves %j alone", (raw) => {
    const p = parse(raw);
    expect(p.title).toBe(raw);
    expect(p.tokens).toEqual([]);
  });

  it("keeps words the user asked to keep as text", () => {
    expect(parse("Plan tomorrow", ["tomorrow"])).toMatchObject({ title: "Plan tomorrow", when: undefined });
    expect(parse("Review x3", ["x3"])).toMatchObject({ title: "Review x3", est: 0 });
  });

  it("reads a repeat and plans the first due day", () => {
    expect(parse("Water plants every mon thu 1c")).toEqual({
      title: "Water plants",
      when: "2026-10-05",
      repeat: { every: "week", days: [1, 4] },
      est: 1,
      tokens: [{ text: "every mon thu", kind: "repeat", repeat: { every: "week", days: [1, 4] } }, { text: "1c", kind: "est", est: 1 }],
    });
    expect(parse("Plan the day every day")).toMatchObject({ title: "Plan the day", when: "today", repeat: { every: "day" } });
    expect(parse("Inbox zero every weekday")).toMatchObject({ title: "Inbox zero", when: "2026-10-05" });
    expect(parse("Pay rent every month")).toMatchObject({ title: "Pay rent", repeat: { every: "month", date: 3 }, when: "today" });
  });

  it("reads an interval and plans its first due day", () => {
    expect(parse("Review budget every 2 weeks on mon and thu 2c")).toEqual({
      title: "Review budget",
      when: "2026-10-05",
      repeat: { every: "week", days: [1, 4], n: 2, from: "2026-10-05" },
      est: 2,
      tokens: [{ text: "every 2 weeks on mon and thu", kind: "repeat", repeat: { every: "week", days: [1, 4], n: 2, from: "2026-10-05" } }, { text: "2c", kind: "est", est: 2 }],
    });
    expect(parse("Gym every 2 weeks on mon, wed and fri")).toMatchObject({ title: "Gym", repeat: { days: [1, 3, 5], n: 2 } });
    expect(parse("Run every other day x2")).toMatchObject({ title: "Run", when: "today", est: 2, repeat: { every: "day", n: 2, from: "2026-10-03" } });
    expect(parse("Read 3 chapters every 3 days")).toMatchObject({ title: "Read 3 chapters", est: 0, repeat: { every: "day", n: 3 } });
    expect(parse("Back up photos every 3 months on the 15th")).toMatchObject({ title: "Back up photos", when: "2026-10-15", repeat: { every: "month", date: 15, n: 3 } });
    expect(parse("Sprint review biweekly 1c")).toMatchObject({ title: "Sprint review", when: "today", est: 1, repeat: { every: "week", days: [6], n: 2 } });
    expect(parse("Stretch alle 2 Wochen am Montag")).toMatchObject({ title: "Stretch", when: "2026-10-05", repeat: { every: "week", days: [1], n: 2 } });
    expect(parse("Pflanzen gießen jeden zweiten Tag")).toMatchObject({ title: "Pflanzen gießen", repeat: { every: "day", n: 2 } });
  });

  it("leaves numbers that aren't an interval alone", () => {
    expect(parse("Pay rent every 2")).toMatchObject({ title: "Pay rent every 2", est: 0, tokens: [] });
    expect(parse("Read 2 books every 2 3c")).toMatchObject({ title: "Read 2 books every 2", est: 3, when: undefined, tokens: [{ text: "3c", kind: "est", est: 3 }] });
    expect(parse("Call mom in 3 days")).toMatchObject({ title: "Call mom", when: "2026-10-06" });
  });

  it.each(["Read every page", "Read every other page", "every day", "Write the daily report", "every 2 weeks"])("leaves %j without a repeat", (raw) => {
    expect(parse(raw).repeat).toBeUndefined();
  });

  it("keeps a repeat phrase as text when asked", () => {
    expect(parse("Stretch every day", ["every day"])).toEqual({ title: "Stretch every day", when: undefined, est: 0, tokens: [] });
    expect(parse("Gym every mon thu", ["every mon thu"]).tokens).toEqual([]);
  });

  it("caps estimates at 24 cycles", () => {
    expect(parse("Thesis 40c").est).toBe(24);
  });
});

describe("hashToken", () => {
  it("finds the label being typed after # at the caret", () => {
    expect(hashToken("Write docs #wo", 14)).toEqual({ at: 11, query: "wo" });
    expect(hashToken("#", 1)).toEqual({ at: 0, query: "" });
    expect(hashToken("Write #docs now", 11)).toEqual({ at: 6, query: "docs" });
    expect(hashToken("Fix #12 crash", 13)).toEqual({ at: 4, query: "12 crash" });
  });
  it("ignores # inside a word, a selection, or no # at all", () => {
    expect(hashToken("C# guide", 8)).toBeNull();
    expect(hashToken("Write #docs", 11, 8)).toBeNull();
    expect(hashToken("Write docs", 10)).toBeNull();
    expect(hashToken("Write #docs", 5)).toBeNull();
  });
});

describe("dropToken", () => {
  it("removes the last occurrence, ignoring case, and leaves room to keep typing", () => {
    expect(dropToken("Pay invoices tomorrow", "tomorrow")).toBe("Pay invoices ");
    expect(dropToken("Plan Friday x3", "x3")).toBe("Plan Friday ");
    expect(dropToken("Call Fri about FRI", "fri")).toBe("Call Fri about ");
  });
  it("returns null when the token is gone", () => {
    expect(dropToken("Pay invoices", "tomorrow")).toBeNull();
  });
});

describe("breaksBetween", () => {
  const S = 5, L = 15;
  it("adds a break between cycles and a long one after every set", () => {
    expect(breaksBetween(1, 4, S, L)).toBe(0);
    expect(breaksBetween(2, 4, S, L)).toBe(5);
    expect(breaksBetween(4, 4, S, L)).toBe(15);
    expect(breaksBetween(5, 4, S, L)).toBe(30);
    expect(breaksBetween(9, 4, S, L)).toBe(6 * S + 2 * L);
  });
});
