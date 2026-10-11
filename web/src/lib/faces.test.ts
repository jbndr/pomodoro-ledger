import { describe, expect, it } from "vitest";
import { BACKDROPS, FACES, inWords, lookOf, LOOKS, matrix, MATRIX_ROWS, RINGS, SEGMENTS, timerBackdrop, timerFace, timerRing, waterLevel } from "./faces";

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

describe("timerRing", () => {
  it("defaults to the arc and keeps every known ring, none included", () => {
    expect(timerRing(undefined)).toBe("arc");
    expect(timerRing("halo")).toBe("arc");
    for (const [id] of RINGS) expect(timerRing(id)).toBe(id);
    expect(timerRing("none")).toBe("none");
  });
});

describe("timerBackdrop", () => {
  it("defaults to the glow and keeps every known background", () => {
    expect(timerBackdrop(undefined)).toBe("glow");
    expect(timerBackdrop("lava")).toBe("glow");
    for (const [id] of BACKDROPS) expect(timerBackdrop(id)).toBe(id);
  });
});

describe("LOOKS", () => {
  it("only uses faces, rings and backgrounds that exist, and no two looks are the same", () => {
    for (const l of LOOKS) {
      expect(timerFace(l.face)).toBe(l.face);
      expect(timerRing(l.ring)).toBe(l.ring);
      expect(timerBackdrop(l.backdrop)).toBe(l.backdrop);
    }
    expect(new Set(LOOKS.map((l) => l.face + l.ring + l.backdrop)).size).toBe(LOOKS.length);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
  });

  it("finds the look a combination makes, and none for a mix of your own", () => {
    expect(lookOf("nixie", "glow", "stars")?.id).toBe("night-shift");
    expect(lookOf("nixie", "arc", "stars")).toBeUndefined();
  });
});

describe("waterLevel", () => {
  it("rises through a focus and drains through a break, meeting at the bell", () => {
    expect(waterLevel("focus", "", 1, 0)).toBe(0);
    expect(waterLevel("focus", "", 0.25, 0)).toBe(0.75);
    expect(waterLevel("short", "", 1, 0)).toBe(1);
    expect(waterLevel("long", "", 0.4, 0)).toBe(0.4);
  });

  it("stays full past the bell and fills once an hour in flow", () => {
    expect(waterLevel("focus", "over", 1, 90_000)).toBe(1);
    expect(waterLevel("focus", "flow", 1, 1_800_000)).toBe(0.5);
    expect(waterLevel("focus", "flow", 1, 7_200_000)).toBe(1);
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

describe("SEGMENTS", () => {
  it("lights every bar for an eight and the two right bars for a one", () => {
    expect(SEGMENTS["8"]).toBe("abcdefg");
    expect(SEGMENTS["1"]).toBe("bc");
    for (const d of "0123456789") expect(SEGMENTS[d]).toMatch(/^[a-g]+$/);
  });
});

describe("inWords", () => {
  it("writes whole minutes, rounding up while counting down", () => {
    expect(inWords("25:00")).toEqual({ n: "Twenty-five", unit: "minutes left" });
    expect(inWords("24:30")).toEqual({ n: "Twenty-five", unit: "minutes left" });
    expect(inWords("01:01")).toEqual({ n: "Two", unit: "minutes left" });
    expect(inWords("01:00")).toEqual({ n: "One", unit: "minute left" });
  });

  it("switches to seconds for the last minute", () => {
    expect(inWords("00:59")).toEqual({ n: "Fifty-nine", unit: "seconds left" });
    expect(inWords("00:01")).toEqual({ n: "One", unit: "second left" });
  });

  it("counts flow and time past the bell up, rounding down", () => {
    expect(inWords("12:34", "flow")).toEqual({ n: "Twelve", unit: "minutes in" });
    expect(inWords("00:42", "flow")).toEqual({ n: "Forty-two", unit: "seconds in" });
    expect(inWords("+02:05", "over")).toEqual({ n: "Two", unit: "minutes over" });
    expect(inWords("+01:00", "over")).toEqual({ n: "One", unit: "minute over" });
  });

  it("falls back to digits past ninety-nine", () => {
    expect(inWords("105:00", "flow")).toEqual({ n: "105", unit: "minutes in" });
  });
});
