import { describe, expect, it } from "vitest";
import { labelMatches, labelOptions, sameLabel } from "./labels";

const labels = [
  { name: "Docs" },
  { name: "Admin" },
  { name: "Engineering" },
  { name: "Old project", archived: true },
  { name: "Side doc work" },
];
const names = (list: { name: string }[]) => list.map((l) => l.name);

describe("labelMatches", () => {
  it("lists visible labels containing the query, prefix matches first, then by name", () => {
    expect(names(labelMatches(labels, "doc"))).toEqual(["Docs", "Side doc work"]);
    expect(names(labelMatches(labels, "IN"))).toEqual(["Admin", "Engineering"]);
    expect(names(labelMatches(labels, ""))).toEqual(["Admin", "Docs", "Engineering", "Side doc work"]);
  });
  it("leaves hidden labels out", () => {
    expect(labelMatches(labels, "old")).toEqual([]);
  });
});

describe("labelOptions", () => {
  it("offers to clear the current label and highlights it when nothing is typed", () => {
    const { opts, idx } = labelOptions(labels, { query: "", value: "docs" });
    expect(opts[0]).toEqual({ name: "", clear: true });
    expect(opts[idx]).toEqual({ name: "Docs" });
  });
  it("highlights the first label when none is set", () => {
    const { opts, idx } = labelOptions(labels, { query: "", value: "" });
    expect(opts.some((o) => o.clear)).toBe(false);
    expect(idx).toBe(0);
  });
  it("offers to create a label that doesn't exist yet", () => {
    expect(labelOptions(labels, { query: " Doc ", value: "" })).toEqual({ opts: [{ name: "Docs" }, { name: "Side doc work" }, { name: "Doc", create: true }], idx: 0 });
    expect(labelOptions(labels, { query: "Travel", value: "" })).toEqual({ opts: [{ name: "Travel", create: true }], idx: 0 });
    expect(labelOptions(labels, { query: "docs", value: "" }).opts).toEqual([{ name: "Docs" }]);
  });
  it("doesn't preselect a new label from a number typed after #", () => {
    expect(labelOptions(labels, { query: "12", value: "", hash: true })).toEqual({ opts: [{ name: "12", create: true }], idx: -1 });
    expect(labelOptions(labels, { query: "12", value: "" }).idx).toBe(0);
  });
  it("lists every label by name for managing, hidden ones included", () => {
    const { opts, idx } = labelOptions(labels, { query: "x", value: "Docs", manage: true });
    expect(names(opts)).toEqual(["Admin", "Docs", "Engineering", "Old project", "Side doc work"]);
    expect(opts[3].archived).toBe(true);
    expect(idx).toBe(-1);
  });
  it("compares names without case", () => {
    expect(sameLabel("Docs", "dOCS")).toBe(true);
    expect(sameLabel("Docs", "Doc")).toBe(false);
  });
});
