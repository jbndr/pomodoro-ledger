import { describe, expect, it } from "vitest";
import { arrange, fuzzy, matchEntry, recency, recordUse, segments, type Entry } from "./palette";

const DAY = 86400000, NOW = Date.UTC(2026, 9, 4, 12);
const titles = (s: { rows: { item: Entry }[] }) => s.rows.map((r) => r.item.title);

describe("fuzzy", () => {
  it("finds letters in order and nothing else", () => {
    expect(fuzzy("skp", "Skip")?.hits).toEqual([0, 1, 3]);
    expect(fuzzy("skp", "Skip to next phase")?.hits).toEqual([0, 1, 13]);
    expect(fuzzy("pks", "Skip")).toBeNull();
    expect(fuzzy("long", "Lo")).toBeNull();
    expect(fuzzy("", "Anything")).toEqual({ score: 0, hits: [] });
  });

  it("ignores case and accents", () => {
    expect(fuzzy("cafe", "Café notes")?.hits).toEqual([0, 1, 2, 3]);
    expect(fuzzy("CAFÉ", "cafe")).not.toBeNull();
  });

  it("prefers runs and word starts over scattered letters", () => {
    expect(fuzzy("tt", "Toggle the timer")?.hits).toEqual([0, 7]);
    expect(fuzzy("nt", "New task")?.hits).toEqual([0, 4]);
    expect(fuzzy("rain", "Brain dump · Soundscape: Rain")?.hits).toEqual([25, 26, 27, 28]);
    expect(fuzzy("set", "Open settings")!.score).toBeGreaterThan(fuzzy("set", "Show every task")!.score);
  });

  it("treats a camel-case hump as a word start", () => {
    expect(fuzzy("pr", "openPullRequest")?.hits).toEqual([4, 8]);
  });

  it("ranks a prefix above the same letters further in, and an exact title above both", () => {
    const exact = fuzzy("skip", "Skip")!.score, prefix = fuzzy("skip", "Skip to next phase")!.score, inside = fuzzy("skip", "Never skip")!.score;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
  });
});

describe("matchEntry", () => {
  it("matches each word of the query in any order", () => {
    const m = matchEntry("rain sound", { title: "Soundscape: Rain" });
    expect(m?.hits).toEqual([0, 1, 2, 3, 4, 12, 13, 14, 15]);
    expect(matchEntry("rain fire", { title: "Soundscape: Rain" })).toBeNull();
  });

  it("falls back to the extra words, scoring lower and highlighting nothing", () => {
    const m = matchEntry("dark", { title: "Switch theme", words: "light dark system appearance" })!;
    expect(m.hits).toEqual([]);
    expect(m.score).toBeLessThan(matchEntry("dark", { title: "Dark mode" })!.score);
  });

  it("favours the shorter title when both match the same way", () => {
    expect(matchEntry("today", { title: "Today" })!.score).toBeGreaterThan(matchEntry("today", { title: "Today plan review" })!.score);
  });
});

describe("recency", () => {
  it("rises with use and halves each week", () => {
    expect(recency(undefined, NOW)).toBe(0);
    const once = recency({ n: 1, at: NOW }, NOW), often = recency({ n: 7, at: NOW }, NOW);
    expect(often).toBeGreaterThan(once);
    expect(recency({ n: 1, at: NOW - 7 * DAY }, NOW)).toBeCloseTo(once / 2);
  });

  it("records uses and keeps only the latest ones", () => {
    let u = recordUse({}, "a", NOW - 2);
    u = recordUse(u, "b", NOW - 1);
    u = recordUse(u, "a", NOW);
    expect(u.a).toEqual({ n: 2, at: NOW });
    expect(Object.keys(recordUse(u, "c", NOW + 1, 2)).sort()).toEqual(["a", "c"]);
  });
});

describe("arrange", () => {
  const items: Entry[] = [
    { id: "start", title: "Start focus", group: "Timer", suggest: true },
    { id: "skip", title: "Skip to next phase", group: "Timer", suggest: true },
    { id: "new", title: "New task", group: "Tasks", suggest: true },
    { id: "settings", title: "Settings", group: "App", words: "preferences options" },
    { id: "theme", title: "Switch theme", group: "App", words: "dark light" },
    { id: "task:1", title: "Write the onboarding guide", group: "Tasks", searchOnly: true },
    { id: "task:2", title: "Settle the invoice", group: "Tasks", searchOnly: true },
  ];

  it("shows Recent, then Suggested, then every group when nothing is typed", () => {
    const s = arrange(items, " ", { settings: { n: 1, at: NOW - DAY }, skip: { n: 3, at: NOW } }, NOW);
    expect(s.map((x) => x.title)).toEqual(["Recent", "Suggested", "App"]);
    expect(titles(s[0])).toEqual(["Skip to next phase", "Settings"]);
    expect(titles(s[1])).toEqual(["Start focus", "New task"]);
    expect(titles(s[2])).toEqual(["Switch theme"]);
  });

  it("leaves search-only entries for typed queries", () => {
    expect(arrange(items, "", {}, NOW).flatMap(titles)).not.toContain("Write the onboarding guide");
    expect(arrange(items, "onboard", {}, NOW).flatMap(titles)).toEqual(["Write the onboarding guide"]);
  });

  it("drops scattered matches when better ones exist", () => {
    expect(arrange(items, "set", {}, NOW).flatMap(titles)).not.toContain("Skip to next phase");
    expect(arrange(items.slice(1, 2), "set", {}, NOW).flatMap(titles)).toEqual(["Skip to next phase"]);
  });

  it("groups matches with the best group first", () => {
    const s = arrange(items, "set", {}, NOW);
    expect(s.map((x) => x.title)).toEqual(["App", "Tasks"]);
    expect(titles(s[0])[0]).toBe("Settings");
  });

  it("lets frequent use win a near tie but not beat a much better match", () => {
    const pair: Entry[] = [{ id: "a", title: "Start focus", group: "G" }, { id: "b", title: "Short break", group: "G" }];
    expect(titles(arrange(pair, "s", {}, NOW)[0])).toEqual(["Start focus", "Short break"]);
    expect(titles(arrange(pair, "s", { b: { n: 5, at: NOW } }, NOW)[0])).toEqual(["Short break", "Start focus"]);
    expect(titles(arrange(pair, "start", { b: { n: 50, at: NOW } }, NOW)[0])).toEqual(["Start focus"]);
  });

  it("caps each group", () => {
    const many = Array.from({ length: 9 }, (_, i): Entry => ({ id: "t" + i, title: "Task " + i, group: "Tasks" }));
    expect(arrange(many, "task", {}, NOW, { perGroup: 3 })[0].rows).toHaveLength(3);
  });
});

describe("segments", () => {
  it("joins neighbouring characters that are both hit or both not", () => {
    expect(segments("Skip it", [0, 1, 5])).toEqual([{ text: "Sk", hit: true }, { text: "ip ", hit: false }, { text: "i", hit: true }, { text: "t", hit: false }]);
    expect(segments("", [])).toEqual([]);
  });
});
