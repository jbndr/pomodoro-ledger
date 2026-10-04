/** A whole number within the field's range, or null when it's empty, zero or out of range. */
export function wholeIn(value: string, min: number, max: number): number | null {
  const v = Math.round(+value);
  return !v || v < min || v > max ? null : v;
}

export const tickVolume = (value: string | number) => Math.max(0, Math.min(100, +value));

export const tickPace = (value: string | number) => ([1, 2, 4].includes(+value) ? +value : 2);

export const workdayEnd = (value: string) => (/^\d\d:\d\d$/.test(value) ? value : "");

/** Where arrow, Home and End keys move in a row of tabs, or -1 for other keys. */
export function rovingIndex(key: string, i: number, n: number): number {
  return key === "ArrowRight" ? (i + 1) % n : key === "ArrowLeft" ? (i - 1 + n) % n : key === "Home" ? 0 : key === "End" ? n - 1 : -1;
}

export type SyncState = "off" | "signedout" | "connecting" | "live" | "offline";

/** What the Sync tab says, and which buttons it offers. */
export function syncCopy(state: SyncState, viaAccount: boolean, email: string) {
  const [title, detail] = {
    off: viaAccount ? ["Synced to your account", "Tasks, history and settings sync automatically."] : ["Saved in this browser", "Account sync isn't set up on this server, so everything stays on this device."],
    signedout: ["Not signed in", "Sign in to keep tasks, history and settings in sync across your devices. What's already here is added to your account."],
    connecting: ["Connecting…", email],
    live: ["Synced", email],
    offline: ["Offline", "Changes are saved here and sync when you're back online. " + email],
  }[state];
  const account = state === "live" || state === "offline" || state === "connecting";
  return {
    title, detail,
    acts: state === "signedout" ? "signin" : account ? "account" : "",
    hint: account ? "The timer and the task you're working on sync too." : "",
  };
}
