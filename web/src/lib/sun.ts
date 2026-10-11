const RAD = Math.PI / 180;

/** Where the sun stands at time `t` seen from a place: degrees above the horizon, and compass bearing from north. */
export function sunPosition(t: number, lat: number, lon: number): { elevation: number; azimuth: number } {
  const d = t / 86_400_000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)), dec = Math.asin(Math.sin(e) * Math.sin(l));
  const ha = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * RAD - ra, phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / RAD;
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha)) / RAD;
  return { elevation, azimuth: (azimuth + 360) % 360 };
}

export type SkyPhase = "dawn" | "day" | "dusk" | "night";

/** The sky's phase from the sun's height: twilight runs from 8° below the horizon to 6° above it. */
export const skyPhaseAt = (elevation: number, azimuth: number): SkyPhase =>
  elevation < -8 ? "night" : elevation < 6 ? (azimuth < 180 ? "dawn" : "dusk") : "day";

/** The next sunrise or sunset within a day, to the minute, or null in polar day or night. */
export function nextSunTurn(t: number, lat: number, lon: number): { at: number; rise: boolean } | null {
  const up = (x: number) => sunPosition(x, lat, lon).elevation > -0.833;
  const was = up(t);
  for (let x = t + 600_000; x <= t + 86_400_000; x += 600_000) {
    if (up(x) === was) continue;
    let lo = x - 600_000, hi = x;
    while (hi - lo > 60_000) { const mid = (lo + hi) / 2; if (up(mid) === was) lo = mid; else hi = mid; }
    return { at: hi, rise: !was };
  }
  return null;
}

/** A stand-in place from the time zone alone: its standard-time longitude and a middling latitude. */
export function guessPlace(now: number): { lat: number; lon: number } {
  const y = new Date(now).getFullYear(), standard = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  return { lat: 45, lon: -standard / 4 };
}
