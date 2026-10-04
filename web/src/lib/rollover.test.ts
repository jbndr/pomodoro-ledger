import { describe, expect, it } from "vitest";
import { carriedOver, leftovers, leftoverText, rolloverMode } from "./rollover";
import type { Task } from "./tasks";

const TK = "2026-10-03";
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, ...o });

describe("leftovers", () => {
  it("finds open tasks planned for an earlier day", () => {
    const list = [
      task("old", { plan: "2026-10-01" }), task("y", { plan: "2026-10-02", today: true }), task("now", { plan: TK, today: true }),
      task("soon", { plan: "2026-10-05" }), task("done", { plan: "2026-10-02", done: true }), task("unstamped", { today: true }),
      task("sys", { plan: "2026-10-02", system: true }), task("sample", { plan: "2026-10-02", sample: true }), task("later"),
    ];
    expect(leftovers(list, TK).map((t) => t.id)).toEqual(["old", "y"]);
  });
});

describe("leftoverText", () => {
  it("says yesterday when every task is from yesterday", () => {
    expect(leftoverText([task("a", { plan: "2026-10-02" })], TK)).toBe("1 unfinished task from yesterday");
    expect(leftoverText([task("a", { plan: "2026-10-02" }), task("b", { plan: "2026-10-02" })], TK)).toBe("2 unfinished tasks from yesterday");
    expect(leftoverText([task("a", { plan: "2026-10-02" }), task("b", { plan: "2026-09-28" })], TK)).toBe("2 unfinished tasks from earlier days");
  });
});

describe("carriedOver", () => {
  it("plans the task for today and keeps its section and order", () => {
    expect(carriedOver(task("a", { plan: "2026-10-01", section: "s1", order: 3 }), TK)).toEqual({ id: "a", title: "a", plan: TK, today: true, section: "s1", order: 3 });
  });
});

describe("rolloverMode", () => {
  it("defaults to ask", () => {
    expect(rolloverMode("always")).toBe("always");
    expect(rolloverMode("never")).toBe("never");
    expect(rolloverMode(undefined)).toBe("ask");
    expect(rolloverMode("sometimes")).toBe("ask");
  });
});
