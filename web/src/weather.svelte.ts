import { skyPhase } from "./lib/faces";
import { sunPosition } from "./lib/sun";
import { precipLevel, skyFromSun, sunSpot, weatherKind, type Weather } from "./lib/weather";
import { ls } from "./state";

const FRESH = 15 * 60_000, RETRY = 5 * 60_000, KEEP = 3 * 3_600_000;

const cached = ls.get<Weather | null>("pl.weather", null);
export const weather = $state<{ now: Weather | null }>({ now: cached && Date.now() - cached.at < KEEP ? cached : null });

let fetching = false, failedAt = 0, target: HTMLElement | null = null, live = false, minutely = 0;

/** Fetches the weather where you roughly are, at most once a quarter hour; only the Weather background asks for it. */
export function wantWeather() {
  const w = weather.now, now = Date.now();
  if (fetching || (w && now - w.at < FRESH) || now - failedAt < RETRY || !navigator.onLine) return;
  fetching = true;
  fetch("/api/weather")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((b: Weather) => { weather.now = b; ls.set("pl.weather", b); if (target) applySky(target, live); })
    .catch(() => { failedAt = Date.now(); })
    .finally(() => { fetching = false; });
}

let last = "";

/** Puts the sky phase, the weather and the sun's place on an element, once a minute or when the weather changes. */
export function applySky(el: HTMLElement, isLive: boolean) {
  target = el; live = isLive;
  minutely ||= window.setInterval(() => { if (target) applySky(target, live); }, 60_000);
  if (live) wantWeather();
  const now = Date.now(), w = weather.now, key = Math.floor(now / 60_000) + ":" + (w?.at ?? 0);
  if (key === last && el.dataset.sky) return;
  last = key;
  let sky = skyPhase(new Date(now).getHours()), kind = "", spot = { x: 72, y: 26 }, cloud = 0, precip = 0;
  if (w) {
    const sun = sunPosition(now, w.lat, w.lon), k = weatherKind(w.symbol);
    sky = skyFromSun(sun.elevation, sun.azimuth); spot = sunSpot(sun.elevation, sun.azimuth, w.lat);
    kind = k; cloud = w.cloud; precip = precipLevel(k, w.precip);
  }
  el.dataset.sky = sky; el.dataset.weather = kind;
  el.style.setProperty("--sun-x", spot.x + "%"); el.style.setProperty("--sun-y", spot.y + "%");
  el.style.setProperty("--cloud", String(cloud)); el.style.setProperty("--precip", String(precip));
}
