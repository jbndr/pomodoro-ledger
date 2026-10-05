export type NudgeRhythm = "break" | "long" | "hour";
export interface Nudge { id: string; text: string; every: NudgeRhythm; on: boolean; preset?: boolean }

export const RHYTHMS: [NudgeRhythm, string][] = [["break", "Every break"], ["long", "Long breaks"], ["hour", "Once an hour"]];

export const PRESET_NUDGES: Nudge[] = [
  { id: "eyes", text: "Rest your eyes: look 20 feet away", every: "break", on: true, preset: true },
  { id: "stretch", text: "Stand up and stretch", every: "long", on: true, preset: true },
  { id: "water", text: "Drink a glass of water", every: "hour", on: false, preset: true },
];

/** The saved list, or the presets for anyone who hasn't changed it. */
export const nudgesOf = (list?: Nudge[]) => (list && list.length ? list : PRESET_NUDGES);

/** The nudge for a break: of those due, the one shown longest ago. */
export function pickNudge(list: Nudge[], seen: Record<string, number>, kind: "short" | "long", now: number): Nudge | null {
  const due = list.filter((n) => n.on && n.text.trim() && (n.every === "break" || (n.every === "long" && kind === "long") || (n.every === "hour" && now - (seen[n.id] || 0) >= 3_600_000)));
  return due.sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0))[0] || null;
}

/** Done counts per day, keeping the last 60 days. */
export function logNudge(log: Record<string, number>, day: string): Record<string, number> {
  const next = { ...log, [day]: (log[day] || 0) + 1 };
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 60));
}
