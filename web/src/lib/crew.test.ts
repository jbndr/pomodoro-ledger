import { describe, expect, it } from "vitest";
import { crewLine, crewShort, focusing, isCrewCode, isCrewRoom, weekText, type CrewMate } from "./crew";

const mate = (id: string, on = true, mode: "focus" | "short" = "focus", status: "idle" | "running" | "paused" = "running"): CrewMate =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), on, s: { mode, status, rem: 1000, total: 1500000 } });

describe("codes", () => {
  it("tells crew codes and crew rooms apart from room codes", () => {
    expect(isCrewCode("VCFMP6QK")).toBe(true);
    expect(isCrewCode("VCFMP6Q")).toBe(false);
    expect(isCrewCode("VCFMP6QL")).toBe(false);
    expect(isCrewRoom("IABCDE")).toBe(true);
    expect(isCrewRoom("ABCDEF")).toBe(false);
    expect(isCrewRoom("IABCDO")).toBe(false);
  });
});

describe("crewLine", () => {
  it("names whoever else is focusing right now", () => {
    expect(crewLine([mate("ana"), mate("ben")], "ana")).toBe("Ben is focusing");
    expect(crewLine([mate("ana"), mate("ben"), mate("cy")], null)).toBe("Ana and 2 more focusing");
  });
  it("puts you in it while the crew can see you focusing", () => {
    expect(crewLine([mate("ana")], "ana", "Thesis group")).toBe("Focusing with Thesis group");
    expect(crewLine([mate("ana"), mate("ben"), mate("cy", true, "short")], "ana", "Thesis group")).toBe("Focusing with Ben");
    expect(crewLine([mate("ana"), mate("ben"), mate("cy"), mate("dee")], "ana", "Thesis group")).toBe("Focusing with Ben and 2 more");
    expect([[mate("ana")], [mate("ana"), mate("ben")], [mate("ana"), mate("ben"), mate("cy"), mate("dee")]].map((ms) => crewShort(ms, "ana"))).toEqual(["With crew", "With Ben", "With Ben +2"]);
  });
  it("leaves out you, anyone away, on a break or paused", () => {
    expect(crewLine([mate("ana"), mate("ben", false), mate("cy", true, "short"), mate("dee", true, "focus", "paused")], "ana")).toBe("");
    expect(focusing(mate("ben", false))).toBe(false);
  });
});

describe("weekText", () => {
  it("counts the week and the one before", () => {
    expect(weekText({ n: 1, last: 0, mine: 1 })).toBe("1 round together this week");
    expect(weekText({ n: 14, last: 9, mine: 3 })).toBe("14 rounds together this week · 9 last week");
  });
});
