export type TimerFace = "classic" | "stack" | "weight" | "numerals" | "thermo" | "sport" | "bedside" | "flap" | "matrix" | "nixie" | "vfd" | "lcd" | "odo" | "serif" | "words";

/** Grouped by kind: plain numbers, then numbers made of something (flaps, wheels, tubes, segments, dots), then words. */
export const FACES: [TimerFace, string, string][] = [
  ["classic", "Classic", "The dial as it is: clean numbers on a ring"],
  ["stack", "Stacked", "Minutes over seconds, big and round, like a watch"],
  ["weight", "Weight", "Rounded numbers that thin out as the time runs down"],
  ["numerals", "Numerals", "The minutes as one big number, the seconds beside it"],
  ["thermo", "Thermostat", "Thin numbers with the seconds raised small"],
  ["sport", "Sport", "Bold italic figures, like a sports watch"],
  ["bedside", "Bedside", "Big soft numbers with a faint glow, for a dark room"],
  ["serif", "Editorial", "Big italic minutes, seconds set small"],
  ["flap", "Split-flap", "Flaps fall over digit by digit, like a station board"],
  ["odo", "Odometer", "Number wheels that roll over and settle"],
  ["nixie", "Nixie", "Glowing digits in glass tubes"],
  ["vfd", "VFD", "Cyan segments behind fine glass, like an old hi-fi"],
  ["lcd", "LCD", "A reflective watch display, each segment with its shadow"],
  ["matrix", "Dot matrix", "LED dots, with a ring of dots for the time left"],
  ["words", "In words", "The time left, written out"],
];

/** Where a new group of faces starts. */
export const FACE_GROUPS = new Set<TimerFace>(["flap", "words"]);

/** A stored timer face, falling back to the classic dial. */
export function timerFace(v: unknown): TimerFace {
  return FACES.some(([id]) => id === v) ? (v as TimerFace) : "classic";
}

export type TimerRing = "none" | "arc" | "close" | "ticks" | "gauge" | "hair" | "tiles" | "dots" | "glow";

export const RINGS: [TimerRing, string, string][] = [
  ["none", "None", "Just the numbers"],
  ["arc", "Arc", "A solid arc with a knob at the time left"],
  ["close", "Closing", "A thick ring that fills up and closes on the bell"],
  ["ticks", "Ticks", "Fine ticks, lit from now to the bell"],
  ["gauge", "Gauge", "A three-quarter gauge with a pointer for how far in you are"],
  ["hair", "Hairline", "A hairline with one glowing point at the time left"],
  ["tiles", "Tiles", "Small flaps that turn over as the time runs down"],
  ["dots", "Dots", "LED dots that go out one by one"],
  ["glow", "Glow", "A lit filament in a glass tube"],
];

/** A stored ring, falling back to the arc. */
export function timerRing(v: unknown): TimerRing {
  return RINGS.some(([id]) => id === v) ? (v as TimerRing) : "arc";
}

export type TimerBackdrop = "glow" | "plain" | "paper" | "plastic" | "black" | "night" | "oled" | "mip" | "aurora" | "sweep" | "sky" | "weather" | "water" | "mesh" | "halftone" | "wash" | "film" | "stars";

/** Grouped by kind: flat and printed, then soft colour, then scenes. */
export const BACKDROPS: [TimerBackdrop, string, string][] = [
  ["plain", "Plain", "Nothing behind the dial"],
  ["paper", "Paper", "Warm, grainy paper"],
  ["plastic", "Plastic", "Flat warm grey, like a handheld game"],
  ["mip", "Transflective", "A screen that reflects daylight, with a fine pixel grid"],
  ["wash", "Wash", "The whole card in the phase colour"],
  ["black", "True black", "Pure black with a soft sheen of glass"],
  ["oled", "Dot grid", "Black with a faint grid of pixels"],
  ["night", "Night red", "Everything in dim red on black, for a dark room"],
  ["film", "Film", "Near-black with moving grain, for the dark"],
  ["halftone", "Halftone", "Print dots in the phase colour, from one corner"],
  ["glow", "Glow", "A soft glow in the colour of the phase"],
  ["aurora", "Aurora", "Colour that drifts slowly while a session runs"],
  ["mesh", "Mesh", "Soft colour around the phase, slowly turning"],
  ["sweep", "Sweep", "Colour that turns once around the card each round"],
  ["sky", "Sky", "The sky where you are, from dawn to night"],
  ["weather", "Weather", "The weather where you are: soft clouds, rain, snow or fog"],
  ["stars", "Starfield", "Stars drifting past at three depths"],
  ["water", "Water", "Fills up as you focus and drains on a break"],
];

/** Where a new group of backgrounds starts. */
export const BACKDROP_GROUPS = new Set<TimerBackdrop>(["glow", "sky"]);

/** A stored background, falling back to the glow. */
export function timerBackdrop(v: unknown): TimerBackdrop {
  return BACKDROPS.some(([id]) => id === v) ? (v as TimerBackdrop) : "glow";
}

export type Look = { id: string; name: string; note: string; face: TimerFace; ring: TimerRing; backdrop: TimerBackdrop };

/** Ready-made combinations of face, ring and background, to start from instead of mixing all three. */
export const LOOKS: Look[] = [
  { id: "default", name: "Default", note: "The dial as it came: clean numbers in the phase colour", face: "classic", ring: "arc", backdrop: "glow" },
  { id: "bold", name: "Bold", note: "The whole card in the phase colour, with tiles that turn over", face: "classic", ring: "tiles", backdrop: "wash" },
  { id: "notebook", name: "Notebook", note: "Italic minutes on warm paper, nothing else", face: "serif", ring: "none", backdrop: "paper" },
  { id: "forecast", name: "Forecast", note: "The time in words, over the weather outside", face: "words", ring: "none", backdrop: "weather" },
  { id: "midnight", name: "Midnight", note: "LED dots among drifting stars, and nothing else", face: "matrix", ring: "none", backdrop: "stars" },
  { id: "wrist", name: "Wrist", note: "Numbers that thin out in a ring that closes, on pure black", face: "weight", ring: "close", backdrop: "black" },
  { id: "sports", name: "Sports", note: "Bold italic figures and a gauge, on a screen that reflects daylight", face: "sport", ring: "gauge", backdrop: "mip" },
  { id: "nightstand", name: "Nightstand", note: "Big soft numbers and a hairline ring, all in dim red", face: "bedside", ring: "hair", backdrop: "night" },
];

/** The look that matches a face, ring and background exactly, if one does. */
export const lookOf = (face: string, ring: string, backdrop: string) => LOOKS.find((l) => l.face === face && l.ring === ring && l.backdrop === backdrop);

/** Backgrounds that are dark in either theme, so the card on them takes the dark theme's ink. */
export const DARK_BACKDROPS = new Set<TimerBackdrop>(["film", "stars", "wash", "black", "oled", "night", "sweep"]);

/** The Weight face's weight: heavy at the start of a session, hairline at the bell. */
export const faceWeight = (frac: number) => Math.round(200 + 800 * Math.max(0, Math.min(1, frac)));

/** Minutes and seconds for faces that set them apart; the last minute shows its seconds alone. */
export function splitClock(chars: string[]): { plus: boolean; big: string; small: string } {
  const t = chars.join(""), plus = t[0] === "+", [m, s] = t.replace("+", "").split(":");
  return !plus && +m === 0 ? { plus, big: String(+s), small: "" } : { plus, big: String(+m), small: s };
}

/** How far through a session the closing rings are: past 1 they lap themselves in overtime. */
export function sessionProgress(up: string, frac: number, upMs: number, span: number) {
  if (up === "over") return 1 + upMs / Math.max(1, span);
  return up === "flow" ? 1 : 1 - frac;
}

/** How full the Water background is, 0 to 1: it rises through a focus and drains through a break, so it never jumps between them. Flow fills it once an hour. */
export function waterLevel(mode: string, kind: string, frac: number, upMs: number) {
  if (kind === "over") return 1;
  if (kind === "flow") return Math.min(1, upMs / 3_600_000);
  return mode === "focus" ? 1 - frac : frac;
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

/** Lit segments a–g of a seven-segment digit. */
export const SEGMENTS: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg" };

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const say = (n: number) => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "") : String(n));

/** The clock text written out: whole minutes, then seconds in the last minute. Counting down rounds up, so 24:30 is still twenty-five minutes. */
export function inWords(text: string, up: "" | "over" | "flow" = ""): { n: string; unit: string } {
  const [m, s] = text.replace("+", "").split(":").map(Number);
  const secs = m * 60 + s, mins = up ? Math.floor(secs / 60) : Math.ceil(secs / 60);
  const tail = up === "over" ? " over" : up === "flow" ? " in" : " left";
  const [n, unit] = (up ? secs >= 60 : secs > 60) ? [mins, mins === 1 ? "minute" : "minutes"] : [secs === 60 ? 1 : secs, secs === 60 ? "minute" : secs === 1 ? "second" : "seconds"];
  const w = say(n);
  return { n: w[0].toUpperCase() + w.slice(1), unit: unit + tail };
}
