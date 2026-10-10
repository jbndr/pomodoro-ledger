import { describe, expect, it } from "vitest";
import { FACES, matrix, MATRIX_ROWS, timerFace } from "./faces";

describe("timerFace", () => {
  it("defaults to the classic dial", () => {
    expect(timerFace(undefined)).toBe("classic");
    expect(timerFace("")).toBe("classic");
    expect(timerFace("sundial")).toBe("classic");
    expect(timerFace(2)).toBe("classic");
  });

  it("keeps every known face", () => {
    for (const [id] of FACES) expect(timerFace(id)).toBe(id);
  });
});

describe("matrix", () => {
  it("lays digits five dots wide with a dot between them", () => {
    expect(matrix("8").cols).toBe(5);
    expect(matrix("25:00").cols).toBe(5 * 4 + 1 + 4);
    expect(matrix("+12:40").cols).toBe(3 + 5 * 4 + 1 + 5);
  });

  it("lights the right dots", () => {
    const { lit } = matrix("1");
    expect(lit.has("2,0")).toBe(true);
    expect(lit.has("0,0")).toBe(false);
    expect([...lit].every((k) => +k.split(",")[1] < MATRIX_ROWS)).toBe(true);
  });

  it("offsets later characters past the gap", () => {
    const { lit } = matrix("1:");
    expect(lit.has("6,2")).toBe(true);
    expect(lit.has("6,4")).toBe(true);
    expect(lit.has("6,3")).toBe(false);
  });

  it("skips characters it has no glyph for", () => {
    expect(matrix("ab").cols).toBe(0);
  });
});
