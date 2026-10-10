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
