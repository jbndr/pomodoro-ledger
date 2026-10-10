import type { SkyPhase } from "./faces";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type Weather = { lat: number; lon: number; place: string; temp: number; cloud: number; precip: number; symbol: string; at: number };

/** The kind of weather a MET Norway symbol code describes, like "lightrainshowers_day". */
export function weatherKind(symbol: string): WeatherKind {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "storm";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("rain")) return "rain";
  if (s === "fog") return "fog";
  if (s === "cloudy") return "cloudy";
  if (s === "partlycloudy") return "partly";
  return "clear";
}

/** The current hour from a Locationforecast "compact" response, or null when it has none. */
export function readForecast(body: unknown): Pick<Weather, "temp" | "cloud" | "precip" | "symbol"> | null {
  const now = (body as { properties?: { timeseries?: { data?: Record<string, any> }[] } })?.properties?.timeseries?.[0]?.data;
  const d = now?.instant?.details, next = now?.next_1_hours;
  if (!d || typeof d.air_temperature !== "number") return null;
  return {
    temp: Math.round(d.air_temperature),
    cloud: Math.max(0, Math.min(1, (+d.cloud_area_fraction || 0) / 100)),
    precip: Math.max(0, +next?.details?.precipitation_amount || 0),
    symbol: String(next?.summary?.symbol_code || "clearsky_day"),
  };
}

/** The sky's colour phase from the sun's height: twilight runs from 8° below the horizon to 6° above it. */
export const skyFromSun = (elevation: number, azimuth: number): SkyPhase =>
  elevation < -8 ? "night" : elevation < 6 ? (azimuth < 180 ? "dawn" : "dusk") : "day";

/** Where the sun's glow sits on the card, in percent: east on the left, high in the sky near the top. */
export function sunSpot(elevation: number, azimuth: number, lat: number): { x: number; y: number } {
  const across = lat >= 0 ? (azimuth - 90) / 180 : ((90 - azimuth + 360) % 360) / 180;
  return { x: Math.round(10 + 80 * Math.max(0, Math.min(1, across))), y: Math.round(Math.max(8, Math.min(92, 86 - elevation * 1.1))) };
}

/** How heavy the rain or snow looks, from 0 to 1. */
export const precipLevel = (kind: WeatherKind, mmPerHour: number) => (kind === "rain" || kind === "snow" || kind === "storm" ? Math.max(0.3, Math.min(1, mmPerHour / 4)) : 0);

/** A few words for the settings hint, like "12° · light rain". */
export function weatherWords(w: Pick<Weather, "temp" | "precip" | "symbol">): string {
  const kind = weatherKind(w.symbol), light = w.precip < 1;
  const words = { clear: "clear", partly: "partly cloudy", cloudy: "cloudy", fog: "fog", rain: light ? "light rain" : "rain", snow: light ? "light snow" : "snow", storm: "thunderstorms" }[kind];
  return w.temp + "° · " + words;
}
