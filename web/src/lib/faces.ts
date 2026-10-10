export type TimerFace = "classic" | "flap" | "matrix" | "nixie";

export const FACES: [TimerFace, string, string][] = [
  ["classic", "Classic", "The dial as it is: clean numbers on a ring"],
  ["flap", "Split-flap", "Flaps fall over digit by digit, like a station board"],
  ["matrix", "Dot matrix", "LED dots, with a ring of dots for the time left"],
  ["nixie", "Nixie", "Glowing digits in glass tubes"],
];

/** A stored timer face, falling back to the classic dial. */
export function timerFace(v: unknown): TimerFace {
  return FACES.some(([id]) => id === v) ? (v as TimerFace) : "classic";
}

export type TimerRing = "none" | "arc" | "tiles" | "dots" | "glow";

export const RINGS: [TimerRing, string, string][] = [
  ["none", "None", "Just the numbers"],
  ["arc", "Arc", "A solid arc with a knob at the time left"],
  ["tiles", "Tiles", "Small flaps that turn over as the time runs down"],
  ["dots", "Dots", "LED dots that go out one by one"],
  ["glow", "Glow", "A lit filament in a glass tube"],
];

/** A stored ring, falling back to the arc. */
export function timerRing(v: unknown): TimerRing {
  return RINGS.some(([id]) => id === v) ? (v as TimerRing) : "arc";
}

export type TimerBackdrop = "glow" | "plain" | "paper" | "aurora" | "sky";

export const BACKDROPS: [TimerBackdrop, string, string][] = [
  ["glow", "Glow", "A soft glow in the colour of the phase"],
  ["plain", "Plain", "Nothing behind the dial"],
  ["paper", "Paper", "Warm, grainy paper"],
  ["aurora", "Aurora", "Colour that drifts slowly while a session runs"],
  ["sky", "Sky", "The sky where you are, from dawn to night"],
];

/** A stored background, falling back to the glow. */
export function timerBackdrop(v: unknown): TimerBackdrop {
  return BACKDROPS.some(([id]) => id === v) ? (v as TimerBackdrop) : "glow";
}

const GLYPHS: Record<string, string[]> = {
  "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ":": [".", ".", "#", ".", "#", ".", "."],
  "+": ["...", "...", ".#.", "###", ".#.", "...", "..."],
};

export const MATRIX_ROWS = 7;

/** A dot-matrix panel for some text: its width in dots, and which dots are lit as "col,row" keys. */
export function matrix(text: string): { cols: number; lit: Set<string> } {
  const lit = new Set<string>();
  let x = 0;
  for (const c of text) {
    const g = GLYPHS[c];
    if (!g) continue;
    if (x) x++;
    g.forEach((row, y) => [...row].forEach((d, dx) => { if (d === "#") lit.add(x + dx + "," + y); }));
    x += g[0].length;
  }
  return { cols: x, lit };
}
