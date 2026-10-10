import { describe, expect, it } from "vitest";
import { sunPosition } from "./sun";

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
