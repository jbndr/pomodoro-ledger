let ready = false;

/** Draws the Halftone background's dots once, as a mask the scene paints in the phase colour. */
export function wantHalftone() {
  if (ready) return;
  ready = true;
  // Dots grow towards the bottom-left corner until they touch, like a risograph print, and fade out before the middle of the card so text never sits on big ones.
  const size = 440, step = 9, max = step * .52, reach = 420;
  let dots = "";
  for (let y = 0, row = 0; y <= size + step; y += step, row++) {
    for (let x = row % 2 ? step / 2 : 0; x <= size + step; x += step) {
      const k = 1 - Math.hypot(x, size - y) / reach, r = max * Math.pow(Math.max(0, k), 1.4);
      if (r >= .35) dots += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${dots}</svg>`;
  document.documentElement.style.setProperty("--ht-mask", `url("${URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))}")`);
}
