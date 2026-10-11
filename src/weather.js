import { readForecast } from "../web/src/lib/weather.ts";

const FRESH_S = 900;
const AGENT = "PomodoroLedger/1.0 (+https://pomodoro.jbndr.com)";

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, max-age=" + (status === 200 ? FRESH_S : 60) } });

// The weather where a visitor roughly is, from Cloudflare's IP location. MET Norway only ever sees this Worker
// and a point rounded to about 10 km, and each point is fetched at most once a quarter hour.
export async function handleWeather(request) {
  const cf = request.cf || {}, lat = Math.round(Number(cf.latitude) * 10) / 10, lon = Math.round(Number(cf.longitude) * 10) / 10;
  if (cf.latitude == null || cf.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return reply({ error: "no location" }, 404);
  const key = new Request("https://weather.internal/" + lat + "," + lon), cache = caches.default;
  let hour = await cache.match(key).then((r) => r && r.json()).catch(() => null);
  if (!hour) {
    const res = await fetch("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + lat + "&lon=" + lon, { headers: { "user-agent": AGENT } }).catch(() => null);
    hour = res && res.ok ? readForecast(await res.json().catch(() => null)) : null;
    if (!hour) return reply({ error: "weather unavailable" }, 502);
    await cache.put(key, new Response(JSON.stringify(hour), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + FRESH_S } })).catch(() => {});
  }
  return reply({ lat, lon, place: String(cf.city || ""), ...hour, at: Date.now() });
}
