export const CREW_MAX = 8;

export type CrewMate = { id: string; name: string; on: boolean; s: { mode: "focus" | "short" | "long"; status: "idle" | "running" | "paused"; rem: number; total: number; end?: number } | null };
export type CrewWeek = { n: number; last: number; mine: number };

/** Crew codes are eight characters from the room alphabet; a crew's room code starts with an I, which random room codes never contain. */
export const isCrewCode = (c: string) => /^[A-HJKMNP-Z2-9]{8}$/.test(c);
export const isCrewRoom = (c: string) => /^I[A-HJKMNP-Z2-9]{5}$/.test(c);

export const focusing = (m: CrewMate) => !!m.on && !!m.s && m.s.mode === "focus" && m.s.status === "running";

/** What the Work together pill says about your crew while you're not in a room; `shared` is the crew's name while it can see you focusing. */
export function crewLine(mates: CrewMate[], you: string | null, shared = "") {
  const on = mates.filter((m) => m.id !== you && focusing(m));
  const who = on.length > 1 ? on[0].name + " and " + (on.length - 1) + " more" : on.length ? on[0].name : "";
  if (shared) return "Focusing with " + (who || shared);
  if (!on.length) return "";
  return on.length === 1 ? who + " is focusing" : who + " focusing";
}

/** The shared line, short enough for the pill on a phone. */
export function crewShort(mates: CrewMate[], you: string | null) {
  const on = mates.filter((m) => m.id !== you && focusing(m));
  return "With " + (on.length ? on[0].name + (on.length > 1 ? " +" + (on.length - 1) : "") : "crew");
}

/** The week so far against the one before, in a few words. */
export function weekText(w: CrewWeek) {
  const now = w.n === 1 ? "1 round" : w.n + " rounds";
  return now + " together this week" + (w.last ? " · " + w.last + " last week" : "");
}
