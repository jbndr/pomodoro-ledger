import { sod } from "./dates";

const day = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
};

/**
 * Whether a build flag is on at `now`: "on" (or unset), "off", a start day "2026-12-01",
 * or an inclusive window "2026-12-01..2027-01-15". Anything unreadable counts as off.
 */
export function flagOn(value: string | undefined, now: number): boolean {
  const v = (value || "").trim().toLowerCase();
  if (!v || v === "on" || v === "true") return true;
  if (v === "off" || v === "false") return false;
  const [a, b] = v.split("..");
  const from = day(a), to = b == null ? Infinity : day(b), t = sod(now);
  if (isNaN(from) || isNaN(to)) return false;
  return t >= from && t <= to;
}
