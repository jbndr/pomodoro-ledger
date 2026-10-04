import { describe, expect, it } from "vitest";
import { applyImport, buildFile, cleanSettings, fileName, FORMAT, parseFile, summary, type Imported, type Ledger } from "./backup";
import type { Task } from "./tasks";

const DEF = { focus: 25, short: 5, sound: true, workdayEnd: "", sections: [] as unknown[] };
const NOW = new Date(2026, 9, 4, 12).getTime();

const task = (id: string, updatedAt: number, extra: Partial<Task> = {}): Task => ({ id, title: id, createdAt: 1, updatedAt, ...extra });

function ledger(tasks: Task[], o: Partial<Ledger> = {}): Ledger {
  return { tasks: new Map(tasks.map((t) => [t.id, t])), settings: { ...DEF }, labels: [], profileAt: 0, ...o };
}

const parsed = (text: string): Imported => {
  const r = parseFile(text);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

const roundTrip = (l: Ledger) => parsed(JSON.stringify(buildFile({ ...l, now: NOW })));

describe("buildFile", () => {
  it("uses the account export's format, one doc per task plus the profile", () => {
    const f = buildFile({ ...ledger([task("b", 20), task("a", 10)], { profileAt: 5 }), email: "me@x.com", timer: { T: { mode: "focus" }, activeId: "a" }, now: NOW });
    expect(f.format).toBe(FORMAT);
    expect(f.email).toBe("me@x.com");
    expect(f.docs.map((d) => [d.kind, d.id, d.at])).toEqual([["profile", "profile", 5], ["task", "a", 10], ["task", "b", 20], ["timer", "timer", NOW]]);
  });
  it("leaves out sample tasks", () => {
    const f = buildFile({ ...ledger([task("a", 1), task("x1", 1, { sample: true })]), now: NOW });
    expect(f.docs.filter((d) => d.kind === "task").map((d) => d.id)).toEqual(["a"]);
  });
  it("names the file after the local day", () => {
    expect(fileName(NOW)).toBe("pomodoro-ledger-2026-10-04.json");
  });
});

describe("round trip", () => {
  const source = ledger(
    [
      task("t1", 100, { project: "Work", sessions: [{ at: 50, ms: 1500000, full: true, run: "r1" }], subtasks: [{ id: "s1", title: "Draft", done: true }], notes: "hi", plan: "2026-10-05" }),
      task("t2", 200, { done: true, doneAt: 190, repeat: { every: "day" }, series: "t2" }),
      task("u1", 300, { system: true, sessions: [{ at: 60, ms: 30000 }] }),
    ],
    { settings: { ...DEF, focus: 50, sound: false }, labels: [{ name: "Work", lastUsed: 9, archived: false, updatedAt: 7 }], profileAt: 40 },
  );

  it("replacing an empty browser gives back the same state", () => {
    const r = applyImport(ledger([]), roundTrip(source), "replace", DEF);
    expect(r.tasks).toEqual(source.tasks);
    expect(r.settings).toEqual(source.settings);
    expect(r.labels).toEqual(source.labels);
    expect(r.removed).toEqual([]);
  });
  it("merging into an empty browser gives back the same state", () => {
    const r = applyImport(ledger([]), roundTrip(source), "merge", DEF);
    expect(r.tasks).toEqual(source.tasks);
    expect(r.settings).toEqual(source.settings);
    expect(r.labels).toEqual(source.labels);
    expect(r.added).toBe(3);
  });
  it("merging a file into the browser it came from changes nothing", () => {
    const r = applyImport(source, roundTrip(source), "merge", DEF);
    expect(r.changed).toEqual([]);
    expect(r.profileChanged).toBe(false);
  });
  it("summarises what the file holds", () => {
    expect(summary(roundTrip(source))).toBe("2 tasks, 2 sessions, 1 label, settings");
  });
});

describe("parseFile", () => {
  const file = (o: object) => JSON.stringify({ format: FORMAT, email: "", exportedAt: NOW, ...o });

  it("rejects anything that isn't an export", () => {
    for (const text of ["", "not json", "[]", "null", "42", JSON.stringify({ tasks: [] }), JSON.stringify({ format: "something-else/1", docs: [] })]) {
      const r = parseFile(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/isn't a Pomodoro Ledger export/);
    }
  });
  it("names newer and older versions", () => {
    const newer = parseFile(file({ format: "pomodoro-ledger/2", docs: [] }));
    const older = parseFile(file({ format: "pomodoro-ledger/0", docs: [] }));
    expect(!newer.ok && newer.error).toMatch(/newer version/);
    expect(!older.ok && older.error).toMatch(/older version/);
  });
  it("rejects files without docs, or with nothing in them", () => {
    const missing = parseFile(file({ docs: undefined }));
    const empty = parseFile(file({ docs: [] }));
    expect(!missing.ok && missing.error).toMatch(/incomplete/);
    expect(!empty.ok && empty.error).toMatch(/empty/);
  });
  it("skips damaged entries and keeps the rest", () => {
    const d = parsed(file({ docs: [
      { kind: "task", id: "a", at: 5, body: { id: "a", title: "A", sessions: [{ at: 1, ms: 10 }, { at: "x" }, null], subtasks: [{ id: 1 }, { id: "s", title: "S" }] } },
      { kind: "task", id: "b", at: 5, body: { id: "b" } },
      { kind: "task", id: "c", at: 5, body: "nope" },
      { kind: "task", id: "x", at: 5, body: { id: "x", title: "Sample", sample: true } },
      "junk",
      { kind: "timer", id: "timer", at: 5, body: {} },
    ] }));
    expect(d.tasks).toEqual([{ id: "a", title: "A", updatedAt: 5, sessions: [{ at: 1, ms: 10 }], subtasks: [{ id: "s", title: "S" }] }]);
    expect(d.skipped).toBe(4);
    expect(d.profile).toBeNull();
  });
  it("reads a file from the account export", () => {
    const server = { format: FORMAT, email: "me@x.com", exportedAt: NOW, docs: [
      { kind: "profile", id: "profile", at: 9, body: { settings: { focus: 45 }, labels: [{ name: "Home" }] } },
      { kind: "task", id: "t1", at: 8, body: { id: "t1", title: "Plan", updatedAt: 8 } },
      { kind: "timer", id: "timer", at: 7, body: { T: {}, activeId: "t1" } },
    ] };
    const d = parsed(JSON.stringify(server));
    expect(d.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(d.profile).toEqual({ settings: { focus: 45 }, labels: [{ name: "Home" }], at: 9 });
    expect(d.exportedAt).toBe(NOW);
  });
  it("keeps the newer copy of a task listed twice", () => {
    const d = parsed(file({ docs: [
      { kind: "task", id: "a", at: 9, body: { id: "a", title: "new", updatedAt: 9 } },
      { kind: "task", id: "a", at: 3, body: { id: "a", title: "old", updatedAt: 3 } },
    ] }));
    expect(d.tasks.map((t) => t.title)).toEqual(["new"]);
  });
});

describe("cleanSettings", () => {
  it("drops values of the wrong type and keeps extra plain ones", () => {
    expect(cleanSettings({ focus: "lots", short: 10, sound: 1, sections: {}, rollover: "ask", weird: { a: 1 } }, DEF)).toEqual({ short: 10, rollover: "ask" });
  });
  it("keeps weekly plans, which default to a list", () => {
    const plans = [{ week: "2026-09-28", objectives: [{ label: "Writing", target: 6, name: "Ship the guide" }], at: 1 }];
    expect(cleanSettings({ plans, planSeen: "2026-09-28" }, { ...DEF, plans: [], planSeen: "" })).toEqual({ plans, planSeen: "2026-09-28" });
    expect(cleanSettings({ plans: "lots" }, { ...DEF, plans: [] })).toEqual({});
  });
});

describe("merge", () => {
  const imported = (tasks: Task[], profile: Imported["profile"] = null): Imported => ({ tasks, profile, exportedAt: NOW, skipped: 0 });

  it("adds new tasks and never deletes local ones", () => {
    const r = applyImport(ledger([task("a", 1)]), imported([task("b", 1)]), "merge", DEF);
    expect([...r.tasks.keys()].sort()).toEqual(["a", "b"]);
    expect(r.changed.map((t) => t.id)).toEqual(["b"]);
    expect(r.removed).toEqual([]);
  });
  it("keeps the newer copy of a conflicting task", () => {
    const mine = task("a", 100, { title: "mine" });
    expect(applyImport(ledger([mine]), imported([task("a", 200, { title: "theirs" })]), "merge", DEF).tasks.get("a")!.title).toBe("theirs");
    const r = applyImport(ledger([mine]), imported([task("a", 50, { title: "theirs" })]), "merge", DEF);
    expect(r.tasks.get("a")!.title).toBe("mine");
    expect(r.changed).toEqual([]);
  });
  it("keeps the local copy on a tie, as sync does", () => {
    const r = applyImport(ledger([task("a", 100, { title: "mine" })]), imported([task("a", 100, { title: "theirs" })]), "merge", DEF);
    expect(r.tasks.get("a")!.title).toBe("mine");
  });
  it("keeps sessions from both copies, whichever wins", () => {
    const mine = task("a", 100, { title: "mine", sessions: [{ at: 10, run: "r1" }, { at: 30, run: "r3" }] });
    const theirs = task("a", 200, { title: "theirs", sessions: [{ at: 10, run: "r1" }, { at: 20, run: "r2" }] });
    const r = applyImport(ledger([mine]), imported([theirs]), "merge", DEF);
    expect(r.tasks.get("a")).toMatchObject({ title: "theirs", sessions: [{ at: 10 }, { at: 20 }, { at: 30 }] });
    expect(r.updated).toBe(1);
  });
  it("adds history an older copy has", () => {
    const mine = task("a", 200, { sessions: [{ at: 10 }] });
    const r = applyImport(ledger([mine]), imported([task("a", 100, { sessions: [{ at: 10 }, { at: 5 }] })]), "merge", DEF);
    expect(r.tasks.get("a")!.sessions).toEqual([{ at: 5 }, { at: 10 }]);
    expect(r.changed).toHaveLength(1);
  });
  it("doesn't copy a session that was moved to another task here", () => {
    const here = ledger([task("a", 300, { sessions: [] }), task("b", 300, { sessions: [{ at: 10, run: "r1" }] })]);
    const r = applyImport(here, imported([task("a", 100, { sessions: [{ at: 10, run: "r1" }] }), task("c", 100, { sessions: [{ at: 10, run: "r1" }] })]), "merge", DEF);
    expect(r.tasks.get("a")!.sessions).toEqual([]);
    expect(r.tasks.get("c")!.sessions).toEqual([]);
    expect(r.tasks.get("b")!.sessions).toHaveLength(1);
  });
  it("takes the file's settings only when they're newer, and merges labels", () => {
    const here = ledger([], { settings: { ...DEF, focus: 30 }, profileAt: 100, labels: [{ name: "Work", updatedAt: 5 }] });
    const older = applyImport(here, imported([], { settings: { focus: 50 }, labels: [{ name: "Home", updatedAt: 1 }, { name: "work", archived: true, updatedAt: 9 }], at: 50 }), "merge", DEF);
    expect(older.settings.focus).toBe(30);
    expect(older.settingsFromFile).toBe(false);
    expect(older.labels.map((l) => [l.name, l.archived])).toEqual([["work", true], ["Home", false]]);
    expect(older.profileChanged).toBe(true);
    const newer = applyImport(here, imported([], { settings: { focus: 50 }, labels: [], at: 150 }), "merge", DEF);
    expect(newer.settings).toEqual({ ...DEF, focus: 50 });
    expect(newer.settingsFromFile).toBe(true);
  });
  it("takes the file's settings when the ones here were never changed", () => {
    const here = ledger([], { settings: { ...DEF, recapSeen: "2026-09-28", planSeen: "2026-09-28" }, profileAt: 500 });
    const r = applyImport(here, imported([], { settings: { focus: 50 }, labels: [], at: 50 }), "merge", DEF);
    expect(r.settings.focus).toBe(50);
  });
});

describe("replace", () => {
  it("makes the browser match the file", () => {
    const here = ledger([task("a", 900), task("b", 900)], { settings: { ...DEF, focus: 30 }, profileAt: 999, labels: [{ name: "Old" }] });
    const r = applyImport(here, { tasks: [task("b", 1, { title: "file" }), task("c", 1)], profile: { settings: { short: 9 }, labels: [{ name: "New" }], at: 1 }, exportedAt: NOW, skipped: 0 }, "replace", DEF);
    expect([...r.tasks.keys()]).toEqual(["b", "c"]);
    expect(r.tasks.get("b")!.title).toBe("file");
    expect(r.removed).toEqual(["a"]);
    expect(r.changed.map((t) => t.id)).toEqual(["b", "c"]);
    expect(r.settings).toEqual({ ...DEF, short: 9 });
    expect(r.labels.map((l) => l.name)).toEqual(["New"]);
    expect([r.added, r.updated]).toEqual([1, 1]);
  });
  it("keeps settings when the file has none", () => {
    const here = ledger([], { settings: { ...DEF, focus: 30 } });
    const r = applyImport(here, { tasks: [task("a", 1)], profile: null, exportedAt: NOW, skipped: 0 }, "replace", DEF);
    expect(r.settings.focus).toBe(30);
    expect(r.profileChanged).toBe(false);
  });
});
