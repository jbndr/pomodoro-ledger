/** A local calendar day as YYYY-MM-DD. */
export type DayKey = string;

export const pad = (n: number): string => String(n).padStart(2, "0");

export const dayKey = (t: number): DayKey => {
  const d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};

/** Start of the local day containing `t`. */
export const sod = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const addDays = (t: number, n: number): number => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/** Local midnight of a day key. */
export const keyTime = (k: DayKey): number => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** The Monday after today; on a Monday, the one a week later. */
export const nextMonday = (now: number): DayKey => dayKey(addDays(sod(now), (8 - new Date(now).getDay()) % 7 || 7));
