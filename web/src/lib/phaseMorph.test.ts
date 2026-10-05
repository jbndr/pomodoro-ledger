import { describe, expect, it } from "vitest";
import { PHASE_MORPHS, phaseMorph } from "./phaseMorph";

describe("phaseMorph", () => {
  it("defaults to the wipe", () => {
    expect(phaseMorph(undefined)).toBe("wipe");
    expect(phaseMorph("")).toBe("wipe");
    expect(phaseMorph("confetti")).toBe("wipe");
    expect(phaseMorph(3)).toBe("wipe");
  });

  it("keeps every known style", () => {
    for (const [id] of PHASE_MORPHS) expect(phaseMorph(id)).toBe(id);
  });
});
