import { describe, expect, it } from "vitest";
import { guessPlace, nextSunTurn, skyPhaseAt, sunPosition } from "./sun";

const at = (iso: string) => Date.parse(iso);

describe("sunPosition", () => {
  it("stands at its midsummer noon height over Vienna", () => {
    const { elevation, azimuth } = sunPosition(at("2026-06-21T11:03:00Z"), 48.21, 16.37);
    expect(elevation).toBeCloseTo(90 - 48.21 + 23.44, 0);
    expect(azimuth).toBeGreaterThan(170);
    expect(azimuth).toBeLessThan(190);
  });

  it("is below the horizon at midnight and rises in the east", () => {
    expect(sunPosition(at("2026-10-11T22:00:00Z"), 48.21, 16.37).elevation).toBeLessThan(-30);
    const morning = sunPosition(at("2026-10-11T05:30:00Z"), 48.21, 16.37);
    expect(morning.azimuth).toBeGreaterThan(80);
    expect(morning.azimuth).toBeLessThan(120);
  });

  it("is close to overhead at the equator on the equinox", () => {
    expect(sunPosition(at("2026-03-20T12:07:00Z"), 0, 0).elevation).toBeGreaterThan(88);
  });
});

describe("the sky from the sun", () => {
  it("has twilight on either side of the horizon", () => {
    expect(skyPhaseAt(-20, 10)).toBe("night");
    expect(skyPhaseAt(-3, 95)).toBe("dawn");
    expect(skyPhaseAt(2, 260)).toBe("dusk");
    expect(skyPhaseAt(30, 180)).toBe("day");
  });

  it("finds tomorrow's sunrise in Vienna after midnight", () => {
    const turn = nextSunTurn(at("2026-10-11T22:00:00Z"), 48.21, 16.37)!;
    expect(turn.rise).toBe(true);
    expect(new Date(turn.at).toISOString().slice(0, 15)).toBe("2026-10-12T05:1");
  });

  it("has none in the polar night", () => {
    expect(nextSunTurn(at("2026-12-21T12:00:00Z"), 85, 0)).toBeNull();
  });

  it("guesses a place from the time zone", () => {
    const p = guessPlace(at("2026-10-11T12:00:00Z"));
    expect(p.lat).toBe(45);
    expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
  });
});
