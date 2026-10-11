import { seeded } from "./lib/scapeSynth";

let ready = false;

const blob = (svg: string) => `url("${URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))}")`;

// Fractal noise with its thin parts cut away reads as cloud; stitched tiles wrap, so a layer can drift forever.
const cloud = (w: number, h: number, fx: number, fy: number, octaves: number, seed: number, gain: number, cut: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${gain} 0 0 0 ${cut}"/></filter><rect width="100%" height="100%" filter="url(#f)"/></svg>`;

// Each piece is drawn again a tile away on every side it might cross, so the pattern repeats without seams.
function streaks(size: number, n: number, seed: number, [short, long]: number[]) {
  const r = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (r() * size).toFixed(1), y = r() * size, len = (short + r() * (long - short)).toFixed(1);
    for (const dy of [0, -size, size]) out += `<rect x="${x}" y="${(y + dy).toFixed(1)}" width="1.1" height="${len}" rx=".55"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g fill="url(#g)">${out}</g></svg>`;
}

function flakes(size: number, n: number, seed: number, [small, big]: number[]) {
  const r = seeded(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, rad = (small + r() * (big - small)).toFixed(2);
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) out += `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${rad}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="s"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g fill="url(#s)">${out}</g></svg>`;
}

/** Draws the Weather background's clouds, rain, snow and fog once, as masks the scene paints in the sky's colours. */
export function wantWeatherArt() {
  if (ready) return;
  ready = true;
  const root = document.documentElement.style;
  root.setProperty("--wx-tex-far", blob(cloud(900, 320, .0035, .009, 4, 11, 2.2, -1.05)));
  root.setProperty("--wx-tex-near", blob(cloud(900, 420, .0028, .0075, 5, 4, 2.6, -1.2)));
  root.setProperty("--wx-tex-fog", blob(cloud(900, 300, .0022, .022, 3, 2, 2, -.7)));
  root.setProperty("--wx-rain-far", blob(streaks(140, 22, 3, [8, 15])));
  root.setProperty("--wx-rain-near", blob(streaks(220, 13, 9, [14, 26])));
  root.setProperty("--wx-snow-far", blob(flakes(160, 22, 5, [.8, 1.4])));
  root.setProperty("--wx-snow-near", blob(flakes(260, 14, 8, [1.6, 2.8])));
}
