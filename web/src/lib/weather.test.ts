import { describe, expect, it } from "vitest";
import { precipLevel, rainSlant, readForecast, sunSpot, weatherKind, weatherWords } from "./weather";

describe("weatherKind", () => {
  it("reads MET Norway symbol codes", () => {
    expect(weatherKind("clearsky_day")).toBe("clear");
    expect(weatherKind("fair_night")).toBe("partly");
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
    const body = { properties: { timeseries: [{ time: "2026-10-11T00:00:00Z", data: { instant: { details: { air_temperature: 11.6, cloud_area_fraction: 87.5, wind_speed: 4.26, wind_from_direction: 271.4 } }, next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.4 } } } }] } };
    expect(readForecast(body)).toEqual({ temp: 12, cloud: 0.875, precip: 0.4, symbol: "lightrain", wind: 4.3, windFrom: 271 });
  });

  it("gives null for anything else", () => {
    expect(readForecast(null)).toBeNull();
    expect(readForecast({ properties: { timeseries: [] } })).toBeNull();
  });
});

describe("rainSlant", () => {
  it("leans with the wind and stays upright in calm air", () => {
    expect(rainSlant(0, 270)).toBe(0);
    expect(rainSlant(5, 270)).toBeLessThan(0);
    expect(rainSlant(5, 90)).toBeGreaterThan(0);
    expect(rainSlant(40, 90)).toBe(18);
    expect(Math.abs(rainSlant(6, 0))).toBe(0);
  });
});

describe("sunSpot", () => {
  it("puts the morning sun on the left, noon high in the middle, and never lower than the top part", () => {
    expect(sunSpot(2, 90, 48)).toEqual({ x: 10, y: 39 });
    expect(sunSpot(30, 180, 48)).toEqual({ x: 50, y: 22 });
    expect(sunSpot(60, 180, 48).y).toBe(6);
    expect(sunSpot(-5, 100, 48).y).toBe(40);
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
    expect(precipLevel("rain", 0.1)).toBe(0.35);
    expect(precipLevel("snow", 8)).toBe(1);
  });
});
