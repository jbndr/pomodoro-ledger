export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type Weather = { lat: number; lon: number; place: string; temp: number; cloud: number; precip: number; symbol: string; wind: number; windFrom: number; at: number };

/** The kind of weather a MET Norway symbol code describes, like "lightrainshowers_day". */
export function weatherKind(symbol: string): WeatherKind {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "storm";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("rain")) return "rain";
  if (s === "fog") return "fog";
  if (s === "cloudy") return "cloudy";
  if (s === "partlycloudy" || s === "fair") return "partly";
  return "clear";
}

/** The current hour from a Locationforecast "compact" response, or null when it has none. */
export function readForecast(body: unknown): Pick<Weather, "temp" | "cloud" | "precip" | "symbol" | "wind" | "windFrom"> | null {
  const now = (body as { properties?: { timeseries?: { data?: Record<string, any> }[] } })?.properties?.timeseries?.[0]?.data;
  const d = now?.instant?.details, next = now?.next_1_hours;
  if (!d || typeof d.air_temperature !== "number") return null;
  return {
    temp: Math.round(d.air_temperature),
    cloud: Math.max(0, Math.min(1, (+d.cloud_area_fraction || 0) / 100)),
    precip: Math.max(0, +next?.details?.precipitation_amount || 0),
    symbol: String(next?.summary?.symbol_code || "clearsky_day"),
    wind: Math.max(0, Math.round((+d.wind_speed || 0) * 10) / 10),
    windFrom: ((Math.round(+d.wind_from_direction || 0) % 360) + 360) % 360,
  };
}

/** How heavy the rain or snow looks, from 0 to 1. */
export const precipLevel = (kind: WeatherKind, mmPerHour: number) => (kind === "rain" || kind === "snow" || kind === "storm" ? Math.max(0.35, Math.min(1, mmPerHour / 4)) : 0);

/** How far rain leans, in degrees, from the wind's push toward the east (west is left); at most 18°. */
export function rainSlant(speed: number, from: number) {
  const east = -speed * Math.sin((from * Math.PI) / 180);
  return Math.round(Math.max(-18, Math.min(18, -east * 2.2))) || 0;
}

/** Where the sun's glow sits on the card, in percent: east on the left, and always in the top part, higher as the sun climbs. */
export function sunSpot(elevation: number, azimuth: number, lat: number): { x: number; y: number } {
  const across = lat >= 0 ? (azimuth - 90) / 180 : ((90 - azimuth + 360) % 360) / 180;
  return { x: Math.round(10 + 80 * Math.max(0, Math.min(1, across))), y: Math.round(Math.max(6, Math.min(40, 40 - elevation * .6))) };
}

/** A few words for the hint, like "12° · light rain". */
export function weatherWords(w: Pick<Weather, "temp" | "precip" | "symbol">): string {
  const kind = weatherKind(w.symbol), light = w.precip < 1;
  const words = { clear: "clear", partly: "a few clouds", cloudy: "cloudy", fog: "fog", rain: light ? "light rain" : "rain", snow: light ? "light snow" : "snow", storm: "thunderstorms" }[kind];
  return w.temp + "° · " + words;
}
