import { describe, expect, it } from "vitest";
import { parseTitle } from "./quickEntry";

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

  it("caps estimates at 24 cycles", () => {
    expect(parse("Thesis 40c").est).toBe(24);
  });
});
