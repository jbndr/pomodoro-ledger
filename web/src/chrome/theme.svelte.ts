import { normTheme, themeColor, type Theme } from "../lib/chrome";

/** The theme picked in the menu or in Settings, shared so both show the same choice. */
export const theme: { v: Theme } = $state({ v: "system" });

export function applyTheme(t: string, themed?: () => void) {
  theme.v = normTheme(t);
  if (theme.v === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme.v;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => { m.content = themeColor(theme.v, m.media); });
  themed?.();
}
