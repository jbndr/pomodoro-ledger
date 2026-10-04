export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];

export const normTheme = (t: unknown): Theme => (THEMES.includes(t as Theme) ? (t as Theme) : "system");
/** The theme after `t`; anything unrecognised starts the cycle over at system. */
export const nextTheme = (t: unknown) => THEMES[(THEMES.indexOf(t as Theme) + 1) % THEMES.length];
export const themeName = (t: string) => t[0].toUpperCase() + t.slice(1);

/** The browser chrome colour for a theme-color meta tag, which carries its own media query. */
export const themeColor = (t: Theme, media: string) => {
  const own = media.includes("dark") ? "#0E1110" : "#EDEFEC";
  return t === "system" ? own : t === "dark" ? "#0E1110" : "#EDEFEC";
};

export const themeToast = (t: Theme) => "Theme: " + themeName(t) + (t === "system" ? " (follows your device)" : "") + ".";

/** Where to put a tooltip of size w×h for a pointer at (x, y): up and right, flipped to stay on screen. */
export function placeTip(x: number, y: number, w: number, h: number, vw: number) {
  let left = x + 14, top = y - h - 12;
  if (left + w > vw - 8) left = x - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 16;
  return { left, top };
}

export type PillInput = { demo: boolean; preview: boolean; storeMode: string; cloud: string };

export function pillOf({ demo, preview, storeMode, cloud }: PillInput) {
  const offline = storeMode === "db" && cloud === "offline";
  const state = preview ? "preview" : offline ? "offline" : storeMode;
  const text = demo ? "Demo mode" : state === "preview" ? "Example data" : offline ? "Offline · will sync" : state === "db" ? "Synced to your account" : cloud === "signedout" ? "Saved in this browser · Sign in to sync" : "Saved in this browser";
  return { state, text };
}
