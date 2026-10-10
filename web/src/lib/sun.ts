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
