import { sunPosition } from "./lib/sun";
import { precipLevel, rainSlant, sunSpot, weatherKind, weatherWords, type Weather } from "./lib/weather";
import { sky } from "./sky.svelte";
import { ls } from "./state";

const FRESH = 15 * 60_000, RETRY = 5 * 60_000, KEEP = 3 * 3_600_000;

const cached = ls.get<Weather | null>("pl.weather", null);
/** The weather where you roughly are, for the Weather background and its hint. */
export const weather = $state<{ now: Weather | null }>({ now: cached && Date.now() - cached.at < KEEP ? cached : null });

let fetching = false, failedAt = 0, target: HTMLElement | null = null, last = "";

/** Asks the server for the weather at most once a quarter hour; only the Weather background needs it. */
export function wantWeather() {
  const w = weather.now, now = Date.now();
  if (fetching || (w && now - w.at < FRESH) || now - failedAt < RETRY || !navigator.onLine) return;
  fetching = true;
  fetch("/api/weather")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((b: Weather) => { weather.now = b; ls.set("pl.weather", b); last = ""; if (target) applyWeather(target); })
    .catch(() => { failedAt = Date.now(); })
    .finally(() => { fetching = false; });
}

/** "12° · light rain · Karlsruhe", or nothing until the weather is known. */
export const weatherHint = () => (weather.now ? [weatherWords(weather.now), weather.now.place].filter(Boolean).join(" · ") : "");

/** Puts the weather on an element: its kind, how cloudy it is, how much falls, which way the wind leans, and where the sun is. */
export function applyWeather(el: HTMLElement) {
  target = el;
  wantWeather();
  const w = weather.now, now = Date.now(), key = (w?.at ?? 0) + ":" + Math.floor(now / 60_000);
  if (key === last && el.dataset.wx) return;
  last = key;
  const kind = w ? weatherKind(w.symbol) : "clear", place = w || sky.here;
  // A grey sky reads as one even when the forecast's cloud fraction is modest, so wet and foggy hours count as covered.
  const cover = !w ? 0 : kind === "clear" ? Math.min(w.cloud, .25) : kind === "partly" ? Math.max(.45, Math.min(w.cloud, .85)) : Math.max(.85, w.cloud);
  el.dataset.wx = kind;
  el.style.setProperty("--wx-cover", cover.toFixed(2));
  el.style.setProperty("--wx-amount", w ? precipLevel(kind, w.precip).toFixed(2) : "0");
  el.style.setProperty("--wx-slant", (kind === "snow" ? 0 : w ? rainSlant(w.wind, w.windFrom) : 0) + "deg");
  el.style.setProperty("--wx-dir", w && Math.sin((w.windFrom * Math.PI) / 180) < 0 ? "reverse" : "normal");
  if (place) {
    const sun = sunPosition(now, place.lat, place.lon), spot = sunSpot(sun.elevation, sun.azimuth, place.lat);
    el.style.setProperty("--sun-x", spot.x + "%");
    el.style.setProperty("--sun-y", spot.y + "%");
  }
}
