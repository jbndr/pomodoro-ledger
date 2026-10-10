import { guessPlace, nextSunTurn, skyPhaseAt, sunPosition } from "./lib/sun";
import { ls } from "./state";

type Place = { lat: number; lon: number; place: string; at: number };

const KEEP = 12 * 3_600_000, RETRY = 10 * 60_000;

const cached = ls.get<Place | null>("pl.here", null);
/** Roughly where you are, for the Sky background; the next sunrise or sunset for its hint. */
export const sky = $state<{ here: Place | null; turn: { at: number; rise: boolean } | null }>({ here: cached && Date.now() - cached.at < KEEP ? cached : null, turn: null });

let asking = false, failedAt = 0, target: HTMLElement | null = null, live = false, minutely = 0, fading = 0, last = "";

/** Asks the server once where you roughly are; only the Sky background needs it. */
export function wantPlace() {
  const now = Date.now();
  if (asking || sky.here || now - failedAt < RETRY || !navigator.onLine) return;
  asking = true;
  fetch("/api/here")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((b) => { sky.here = { lat: b.lat, lon: b.lon, place: b.place || "", at: Date.now() }; ls.set("pl.here", sky.here); last = ""; if (target) applySky(target, live); })
    .catch(() => { failedAt = Date.now(); })
    .finally(() => { asking = false; });
}

/** Puts the sky's phase (dawn, day, dusk or night, from where the sun really is) on an element, once a minute. */
export function applySky(el: HTMLElement, isLive: boolean) {
  target = el; live = isLive;
  minutely ||= window.setInterval(() => { if (target) applySky(target, live); }, 60_000);
  if (live) wantPlace();
  const now = Date.now(), key = String(Math.floor(now / 60_000));
  if (key === last && el.dataset.sky) return;
  last = key;
  const p = sky.here || guessPlace(now), sun = sunPosition(now, p.lat, p.lon), phase = skyPhaseAt(sun.elevation, sun.azimuth);
  sky.turn = nextSunTurn(now, p.lat, p.lon);
  if (el.dataset.sky === phase) return;
  // A new phase fades in over a minute and a half; the first one, and theme switches, change at once.
  if (el.dataset.sky) { el.classList.add("sky-fade"); clearTimeout(fading); fading = window.setTimeout(() => el.classList.remove("sky-fade"), 95_000); }
  el.dataset.sky = phase;
}
