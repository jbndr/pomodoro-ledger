import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "./dates";
import type { Session, Task, Tasks } from "./tasks";
import { cleanPlans, labelChoices, objectiveFor, objectiveProgress, offerDue, planOf, planWeek, rehome, settle, suggestTarget, weekLeftovers, withPlan, type WeekPlan } from "./weekPlan";

const MON = new Date(2026, 8, 28).getTime(), WEEK = "2026-09-28", NEXT = "2026-10-05";
const MIN = 60000, HOUR = 60 * MIN;
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, ...o });
const tasks = (...list: Task[]): Tasks => new Map(list.map((t) => [t.id, t]));
const cycle = (day: number, o: Partial<Session> = {}): Session => ({ at: addDays(MON, day) + 10 * HOUR, ms: 25 * MIN, full: true, ...o });
const plan = (week: string, ...objectives: WeekPlan["objectives"]): WeekPlan => ({ week, objectives, at: 1 });

describe("cleanPlans", () => {
  it("keeps valid objectives, up to three per week, one per label", () => {
    const out = cleanPlans([{ week: WEEK, at: 5, objectives: [
      { label: " Writing ", target: 6.4, name: "  Ship the guide " }, { label: "writing", target: 3 }, { label: "", target: 2 },
      { label: "App", target: 0 }, { label: "Admin", target: 99, name: "" }, { label: "Extra", target: 2 }, { label: "Bad", target: "x" },
    ] }]);
    expect(out).toEqual([{ week: WEEK, at: 5, objectives: [{ label: "Writing", target: 6, name: "Ship the guide" }, { label: "App", target: 1 }, { label: "Admin", target: 60 }] }]);
  });
  it("drops junk, keeps the newest copy of a week, sorts and trims old weeks", () => {
    const o = [{ label: "A", target: 2 }];
    const weeks = [...Array(14)].map((_, i) => ({ week: dayKey(addDays(MON, -7 * i)), objectives: o, at: 1 }));
    const out = cleanPlans([null, "x", { week: "soon", objectives: o }, { week: WEEK, objectives: [] }, ...weeks, { week: WEEK, objectives: [{ label: "B", target: 3 }], at: 9 }]);
    expect(out).toHaveLength(12);
    expect(out.at(-1)).toEqual({ week: WEEK, objectives: [{ label: "B", target: 3 }], at: 9 });
    expect(out[0].week < out[1].week).toBe(true);
    expect(cleanPlans(undefined)).toEqual([]);
  });
});

describe("withPlan", () => {
  it("replaces the week's plan, and clears it without objectives", () => {
    const plans = [plan(WEEK, { label: "A", target: 2 })];
    expect(planOf(withPlan(plans, plan(WEEK, { label: "B", target: 4 })), WEEK)!.objectives).toEqual([{ label: "B", target: 4 }]);
    expect(withPlan(plans, plan(WEEK))).toEqual([]);
    expect(withPlan(plans, plan(NEXT, { label: "C", target: 1 })).map((p) => p.week)).toEqual([WEEK, NEXT]);
  });
});

describe("planWeek", () => {
  it("plans the coming week on Sundays and the current one otherwise", () => {
    expect(dayKey(planWeek(new Date(2026, 9, 4, 18).getTime()))).toBe(NEXT);
    expect(dayKey(planWeek(new Date(2026, 9, 5, 8).getTime()))).toBe(NEXT);
    expect(dayKey(planWeek(new Date(2026, 9, 1, 8).getTime()))).toBe(WEEK);
  });
});

describe("objectiveProgress", () => {
  it("counts cycles and focus in the week under each label, sessions by their own label", () => {
    const list = tasks(
      task("a", { project: "Writing", sessions: [cycle(0), cycle(2, { full: false, ms: 10 * MIN }), cycle(-1), cycle(7), cycle(3, { project: "App" })] }),
      task("b", { sessions: [cycle(4, { project: "writing" })] }),
    );
    const p = objectiveProgress(list, plan(WEEK, { label: "Writing", target: 2 }, { label: "App", target: 3, name: "Ship" }));
    expect(p).toEqual([
      { label: "Writing", target: 2, cycles: 2, ms: 60 * MIN, hit: true },
      { label: "App", target: 3, name: "Ship", cycles: 1, ms: 25 * MIN, hit: false },
    ]);
  });
});

describe("objectiveFor", () => {
  it("matches a task's label in any letter case", () => {
    const p = plan(WEEK, { label: "Writing", target: 2 });
    expect(objectiveFor(p, task("a", { project: "writing" }))).toEqual({ label: "Writing", target: 2 });
    expect(objectiveFor(p, task("b", { project: "App" }))).toBeNull();
    expect(objectiveFor(p, task("c"))).toBeNull();
    expect(objectiveFor(null, task("d", { project: "Writing" }))).toBeNull();
  });
});

describe("weekLeftovers", () => {
  it("finds open one-off tasks planned before the week, oldest first", () => {
    const list = [
      task("late", { plan: "2026-10-02", order: 1 }), task("old", { plan: "2026-09-20" }), task("today", { today: true }),
      task("next", { plan: NEXT }), task("done", { plan: "2026-10-01", done: true }), task("rep", { plan: "2026-10-01", repeat: { every: "day" } }),
      task("sys", { plan: "2026-10-01", system: true }), task("someday"), task("early", { plan: "2026-10-02", order: 0 }),
    ];
    expect(weekLeftovers(list, NEXT, "2026-10-04").map((t) => t.id)).toEqual(["old", "early", "late", "today"]);
    expect(weekLeftovers(list, NEXT, "2026-10-05").map((t) => t.id)).toEqual(["old", "early", "late"]);
  });
});

describe("settle", () => {
  const t = task("a", { plan: "2026-10-01", today: true, section: "s1", order: 2 });
  it("rolls into today when the week is under way", () => {
    expect(settle(t, "week", WEEK, "2026-10-02")).toEqual({ ...t, plan: "2026-10-02", today: true });
  });
  it("rolls to the first day of a week still to come", () => {
    expect(settle(t, "week", NEXT, "2026-10-04")).toEqual({ id: "a", title: "a", plan: NEXT, today: false, order: 2 });
  });
  it("moves to Later", () => {
    expect(settle(t, "later", NEXT, "2026-10-04")).toEqual({ id: "a", title: "a", today: false, order: 2 });
  });
});

describe("rehome", () => {
  it("moves each session into its month's bucket and keeps its label", () => {
    const buckets: Record<string, Task> = { "2026-09": task("unplanned-2026-09", { system: true, sessions: [cycle(1, { ms: 1 })] }) };
    const bucket = (at: number) => buckets[dayKey(at).slice(0, 7)] || task("unplanned-" + dayKey(at).slice(0, 7), { system: true, sessions: [] });
    const out = rehome(task("x", { project: "App", sessions: [cycle(2), cycle(0, { project: "" }), cycle(5)] }), bucket);
    expect(out.map((u) => u.id)).toEqual(["unplanned-2026-09", "unplanned-2026-10"]);
    expect(out[0].sessions!.map((s) => s.project)).toEqual(["", undefined, "App"]);
    expect(out[1].sessions!.map((s) => s.project)).toEqual(["App"]);
    expect(buckets["2026-09"].sessions).toHaveLength(1);
    expect(rehome(task("y"), bucket)).toEqual([]);
  });
});

describe("labelChoices", () => {
  it("lists visible labels, most focus in the week first, then the most recently used", () => {
    const labels = [{ name: "Admin", lastUsed: 5 }, { name: "Writing", lastUsed: 1 }, { name: "Hidden", archived: true }, { name: "App", lastUsed: 9 }];
    const list = tasks(task("a", { project: "Writing", sessions: [cycle(1), cycle(2)] }), task("b", { project: "Hidden", sessions: [cycle(1)] }), task("c", { sessions: [cycle(1, { project: "Fresh" }), cycle(9, { project: "Admin" })] }));
    expect(labelChoices(list, labels, WEEK)).toEqual([
      { name: "Writing", cycles: 2, ms: 50 * MIN }, { name: "Fresh", cycles: 1, ms: 25 * MIN },
      { name: "App", cycles: 0, ms: 0 }, { name: "Admin", cycles: 0, ms: 0 },
    ]);
  });
});

describe("suggestTarget", () => {
  it("repeats last week or starts at four", () => {
    expect(suggestTarget(0)).toBe(4);
    expect(suggestTarget(7)).toBe(7);
    expect(suggestTarget(80)).toBe(60);
  });
});

describe("offerDue", () => {
  const sun = new Date(2026, 9, 4, 9).getTime(), mon = new Date(2026, 9, 5, 9).getTime(), tue = new Date(2026, 9, 6, 9).getTime(), wed = new Date(2026, 9, 7, 9).getTime();
  it("offers Sunday to Tuesday for the week being planned", () => {
    expect(offerDue(sun, [], "")).toBe(NEXT);
    expect(offerDue(mon, [], "")).toBe(NEXT);
    expect(offerDue(tue, [], undefined)).toBe(NEXT);
    expect(offerDue(wed, [], "")).toBeNull();
    expect(offerDue(new Date(2026, 9, 3, 9).getTime(), [], "")).toBeNull();
  });
  it("stays quiet once the week has a plan or was waved off", () => {
    expect(offerDue(mon, [plan(NEXT, { label: "A", target: 2 })], "")).toBeNull();
    expect(offerDue(mon, [], NEXT)).toBeNull();
    expect(offerDue(mon, [], WEEK)).toBe(NEXT);
  });
});
