import { describe, expect, it } from "vitest";
import { groupAt, jump, place, placements, step, toTop, type Entry } from "./order";

const g = (key: string, end?: string): Entry => ({ kind: "group", g: key, ...(end ? { end } : {}) });
const t = (id: string): Entry => ({ kind: "task", id });
const names = (list: Entry[] | null) => list && list.map((e) => (e.kind === "group" ? "#" + e.g : e.id));

// Today with one loose task and two sections.
const today = [g("today"), t("a"), g("sec:deep"), t("b"), t("c"), g("sec:admin"), t("d")];

describe("step", () => {
  it("swaps with a neighbouring task", () => {
    expect(names(step(today, "c", true))).toEqual(["#today", "a", "#sec:deep", "c", "b", "#sec:admin", "d"]);
    expect(names(step(today, "b", false))).toEqual(["#today", "a", "#sec:deep", "c", "b", "#sec:admin", "d"]);
  });
  it("crosses a heading into the next or previous group", () => {
    expect(names(step(today, "b", true))).toEqual(["#today", "a", "b", "#sec:deep", "c", "#sec:admin", "d"]);
    expect(names(step(today, "c", false))).toEqual(["#today", "a", "#sec:deep", "b", "#sec:admin", "c", "d"]);
  });
  it("stops at the top heading and the end of the list", () => {
    expect(step(today, "a", true)).toBeNull();
    expect(step(today, "d", false)).toBeNull();
    expect(step([t("x"), t("y")], "x", true)).toBeNull();
  });
});

describe("jump", () => {
  it("goes to the top of the next group", () => {
    expect(names(jump(today, "a", false))).toEqual(["#today", "#sec:deep", "a", "b", "c", "#sec:admin", "d"]);
    expect(names(jump(today, "c", false))).toEqual(["#today", "a", "#sec:deep", "b", "#sec:admin", "c", "d"]);
  });
  it("goes to the end of the previous group", () => {
    expect(names(jump(today, "d", true))).toEqual(["#today", "a", "#sec:deep", "b", "c", "d", "#sec:admin"]);
    expect(names(jump(today, "b", true))).toEqual(["#today", "a", "b", "#sec:deep", "c", "#sec:admin", "d"]);
  });
  it("has nowhere to go from the first or last group, or without headings", () => {
    expect(jump(today, "a", true)).toBeNull();
    expect(jump(today, "d", false)).toBeNull();
    expect(jump([t("x"), t("y")], "y", true)).toBeNull();
  });
});

describe("place", () => {
  it("moves a task before a list position, either direction", () => {
    expect(names(place(today, "d", 1))).toEqual(["#today", "d", "a", "#sec:deep", "b", "c", "#sec:admin"]);
    expect(names(place(today, "a", 5))).toEqual(["#today", "#sec:deep", "b", "c", "a", "#sec:admin", "d"]);
    expect(names(place(today, "a", null))).toEqual(["#today", "#sec:deep", "b", "c", "#sec:admin", "d", "a"]);
  });
});

describe("groupAt", () => {
  it("finds the heading above a position", () => {
    expect(groupAt(today, 1, "x")).toBe("today");
    expect(groupAt(today, 5, "x")).toBe("sec:deep");
    expect(groupAt(today, 99, "x")).toBe("sec:admin");
    expect(groupAt([t("a")], 1, "later")).toBe("later");
  });
});

describe("placements", () => {
  it("numbers tasks in order and tags each with its group", () => {
    expect(placements(today, "today")).toEqual([
      { id: "a", g: "today", end: "", order: 0 },
      { id: "b", g: "sec:deep", end: "", order: 1 },
      { id: "c", g: "sec:deep", end: "", order: 2 },
      { id: "d", g: "sec:admin", end: "", order: 3 },
    ]);
  });
  it("carries a month heading's range and falls back without headings", () => {
    expect(placements([g("2026-11-01", "2026-11-30"), t("m")], "later")).toEqual([{ id: "m", g: "2026-11-01", end: "2026-11-30", order: 0 }]);
    expect(placements([t("x")], "later")).toEqual([{ id: "x", g: "later", end: "", order: 0 }]);
  });
});

describe("toTop", () => {
  it("moves a task to the top of its own group", () => {
    expect(names(toTop(today, ["c"]))).toEqual(["#today", "a", "#sec:deep", "c", "b", "#sec:admin", "d"]);
  });
  it("keeps several picked tasks in their order, each at the top of its group", () => {
    const list = [g("today"), t("a"), t("b"), t("c"), g("sec:deep"), t("d"), t("e")];
    expect(names(toTop(list, ["c", "b", "e"]))).toEqual(["#today", "b", "c", "a", "#sec:deep", "e", "d"]);
  });
  it("returns null when everything is already on top", () => {
    expect(toTop(today, ["a"])).toBeNull();
    expect(toTop(today, ["b", "d"])).toBeNull();
    expect(toTop(today, ["missing"])).toBeNull();
  });
});
