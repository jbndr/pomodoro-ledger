import { describe, expect, it } from "vitest";
import { focusTasks, labelHue, matchesLabel, nextLabelHue, progressLabelNames, projectNames, sessionProject, setLabelHues, type Tasks } from "./tasks";
import { LABEL_HUES } from "./labels";

const list: Tasks = new Map([
  ["a", { id: "a", title: "A", project: " Docs ", sessions: [{ at: 1, ms: 1 }, { at: 2, ms: 1, project: "Admin" }, { at: 3, ms: 1, project: "" }] }],
  ["b", { id: "b", title: "B", sessions: [{ at: 4, ms: 1 }] }],
  ["u", { id: "u", title: "Unplanned", system: true, project: "Hidden", sessions: [] }],
]);

describe("labels", () => {
  it("lets a session override its task's label, including with no label", () => {
    const a = list.get("a")!;
    expect(a.sessions!.map((s) => sessionProject(a, s))).toEqual(["Docs", "Admin", ""]);
  });
  it("matches the all, no-label and named filters", () => {
    expect([matchesLabel("Docs", ""), matchesLabel("", "none"), matchesLabel("Docs", "none"), matchesLabel("Docs", "project:Docs")]).toEqual([true, true, false, true]);
  });
  it("lists task labels, and progress also includes session labels", () => {
    expect(projectNames(list)).toEqual(["Docs"]);
    expect(progressLabelNames(list)).toEqual(["Admin", "Docs"]);
  });
  it("narrows tasks to the sessions that count for a filter", () => {
    const docs = focusTasks(list, "project:Docs");
    expect([...docs.keys()]).toEqual(["a"]);
    expect(docs.get("a")!.sessions!.map((s) => s.at)).toEqual([1]);
    expect([...focusTasks(list, "none").keys()]).toEqual(["a", "b"]);
    expect(focusTasks(list, "")).toBe(list);
  });
  it("gives a label the same colour in any letter case", () => {
    expect(labelHue("Docs")).toBe(labelHue("DOCS"));
  });
  it("uses the colour a label was given, and its old colour otherwise", () => {
    const before = labelHue("Docs");
    setLabelHues([{ name: "docs", hue: 335 }, { name: "Odd", hue: 7 }]);
    expect(labelHue("Docs")).toBe(335);
    expect(LABEL_HUES).toContain(labelHue("Odd"));
    setLabelHues([]);
    expect(labelHue("Docs")).toBe(before);
  });
  it("gives a new label the colour fewest labels use, orange last", () => {
    expect(nextLabelHue([])).toBe(LABEL_HUES[0]);
    setLabelHues([{ name: "A", hue: 290 }, { name: "B", hue: 195 }]);
    expect(nextLabelHue([{ name: "A", hue: 290 }, { name: "B", hue: 195 }])).toBe(335);
    const all = LABEL_HUES.slice(0, -1).map((hue, i) => ({ name: "L" + i, hue }));
    setLabelHues(all);
    expect(nextLabelHue(all)).toBe(LABEL_HUES.at(-1));
    setLabelHues([]);
  });
});
