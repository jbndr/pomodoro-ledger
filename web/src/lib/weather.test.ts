import { describe, expect, it } from "vitest";
import { precipLevel, readForecast, skyFromSun, sunSpot, weatherKind, weatherWords } from "./weather";

describe("weatherKind", () => {
  it("reads MET Norway symbol codes", () => {
    expect(weatherKind("clearsky_day")).toBe("clear");
    expect(weatherKind("fair_night")).toBe("clear");
    expect(weatherKind("partlycloudy_polartwilight")).toBe("partly");
    expect(weatherKind("cloudy")).toBe("cloudy");
    expect(weatherKind("fog")).toBe("fog");
    expect(weatherKind("lightrainshowers_day")).toBe("rain");
    expect(weatherKind("heavysleet")).toBe("snow");
    expect(weatherKind("rainandthunder")).toBe("storm");
  });
});

describe("readForecast", () => {
  it("takes the first hour", () => {
    const body = { properties: { timeseries: [{ time: "2026-10-11T00:00:00Z", data: { instant: { details: { air_temperature: 11.6, cloud_area_fraction: 87.5 } }, next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.4 } } } }] } };
    expect(readForecast(body)).toEqual({ temp: 12, cloud: 0.875, precip: 0.4, symbol: "lightrain" });
  });

  it("gives null for anything else", () => {
    expect(readForecast(null)).toBeNull();
    expect(readForecast({ properties: { timeseries: [] } })).toBeNull();
  });
});

describe("the sky from the sun", () => {
  it("has twilight on either side of the horizon", () => {
    expect(skyFromSun(-20, 10)).toBe("night");
    expect(skyFromSun(-3, 95)).toBe("dawn");
    expect(skyFromSun(2, 260)).toBe("dusk");
    expect(skyFromSun(30, 180)).toBe("day");
  });

  it("puts the morning sun low on the left and noon high in the middle", () => {
    expect(sunSpot(2, 90, 48)).toEqual({ x: 10, y: 84 });
    expect(sunSpot(60, 180, 48)).toEqual({ x: 50, y: 20 });
    expect(sunSpot(5, 265, 48).x).toBeGreaterThan(85);
    expect(sunSpot(40, 0, -33).x).toBe(50);
  });
});

describe("words and levels", () => {
  it("describes the weather briefly", () => {
    expect(weatherWords({ temp: 12, precip: 0.4, symbol: "lightrain" })).toBe("12° · light rain");
    expect(weatherWords({ temp: -3, precip: 0, symbol: "clearsky_night" })).toBe("-3° · clear");
  });

  it("only rains or snows when the sky does", () => {
    expect(precipLevel("clear", 3)).toBe(0);
    expect(precipLevel("rain", 0.1)).toBe(0.3);
    expect(precipLevel("snow", 8)).toBe(1);
  });
});
