import { describe, expect, it } from "vitest";
import { focusTasks, labelHue, matchesLabel, progressLabelNames, projectNames, sessionProject, type Tasks } from "./tasks";

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
});
