export const CREW_MAX = 8;

export type CrewMate = { id: string; name: string; on: boolean; s: { mode: "focus" | "short" | "long"; status: "idle" | "running" | "paused"; rem: number; total: number; end?: number } | null };
export type CrewWeek = { n: number; last: number; mine: number };

/** Crew codes are eight characters from the room alphabet; a crew's room code starts with an I, which random room codes never contain. */
export const isCrewCode = (c: string) => /^[A-HJKMNP-Z2-9]{8}$/.test(c);
export const isCrewRoom = (c: string) => /^I[A-HJKMNP-Z2-9]{5}$/.test(c);

export const focusing = (m: CrewMate) => !!m.on && !!m.s && m.s.mode === "focus" && m.s.status === "running";

/** What the Work together pill says about your crew while you're not in a room: who is focusing right now. */
export function crewLine(mates: CrewMate[], you: string | null) {
  const on = mates.filter((m) => m.id !== you && focusing(m));
  if (!on.length) return "";
  return on.length === 1 ? on[0].name + " is focusing" : on[0].name + " and " + (on.length - 1) + " more focusing";
}

/** The week so far against the one before, in a few words. */
export function weekText(w: CrewWeek) {
  const now = w.n === 1 ? "1 round" : w.n + " rounds";
  return now + " together this week" + (w.last ? " · " + w.last + " last week" : "");
}
