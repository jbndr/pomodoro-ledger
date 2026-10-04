import { describe, expect, it } from "vitest";
import { nextTheme, normTheme, pillOf, placeTip, themeColor, themeName, themeToast } from "./chrome";

describe("themes", () => {
  it("cycles system, light, dark", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
  it("starts over at system from anything unknown", () => {
    expect(nextTheme("sepia")).toBe("system");
    expect(nextTheme(null)).toBe("system");
    expect(normTheme("sepia")).toBe("system");
    expect(normTheme("dark")).toBe("dark");
  });
  it("names themes for labels and toasts", () => {
    expect(themeName("light")).toBe("Light");
    expect(themeToast("dark")).toBe("Theme: Dark.");
    expect(themeToast("system")).toBe("Theme: System (follows your device).");
  });
  it("matches the browser colour to a forced theme, or to each meta tag's own media otherwise", () => {
    const light = "(prefers-color-scheme: light)", dark = "(prefers-color-scheme: dark)";
    expect([themeColor("system", light), themeColor("system", dark)]).toEqual(["#EDEFEC", "#0E1110"]);
    expect([themeColor("light", light), themeColor("light", dark)]).toEqual(["#EDEFEC", "#EDEFEC"]);
    expect([themeColor("dark", light), themeColor("dark", dark)]).toEqual(["#0E1110", "#0E1110"]);
  });
});

describe("placeTip", () => {
  it("sits above and to the right of the pointer", () => {
    expect(placeTip(100, 300, 120, 40, 1300)).toEqual({ left: 114, top: 248 });
  });
  it("flips to the left near the right edge", () => {
    expect(placeTip(1250, 300, 120, 40, 1300)).toEqual({ left: 1116, top: 248 });
  });
  it("stays 8px inside the left edge when neither side fits", () => {
    expect(placeTip(100, 300, 380, 40, 390)).toEqual({ left: 8, top: 248 });
  });
  it("drops below the pointer near the top", () => {
    expect(placeTip(100, 30, 120, 40, 1300)).toEqual({ left: 114, top: 46 });
  });
});

describe("pillOf", () => {
  const base = { demo: false, preview: false, storeMode: "local", cloud: "off" };
  it("shows where data is kept", () => {
    expect(pillOf(base)).toEqual({ state: "local", text: "Saved in this browser" });
    expect(pillOf({ ...base, storeMode: "db", cloud: "live" })).toEqual({ state: "db", text: "Synced to your account" });
  });
  it("prompts to sign in when signed out", () => {
    expect(pillOf({ ...base, cloud: "signedout" }).text).toBe("Saved in this browser · Sign in to sync");
  });
  it("warns while synced data is offline", () => {
    expect(pillOf({ ...base, storeMode: "db", cloud: "offline" })).toEqual({ state: "offline", text: "Offline · will sync" });
    expect(pillOf({ ...base, cloud: "offline" }).state).toBe("local");
  });
  it("flags example data and the demo", () => {
    expect(pillOf({ ...base, preview: true })).toEqual({ state: "preview", text: "Example data" });
    expect(pillOf({ ...base, preview: true, demo: true })).toEqual({ state: "preview", text: "Demo mode" });
  });
});
