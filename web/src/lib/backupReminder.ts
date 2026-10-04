import { sod } from "./dates";
import type { Task } from "./tasks";

const DAY = 864e5;
export const EVERY_DAYS = 30, SNOOZE_DAYS = 7;

/** What this device remembers about backups: last export, snooze end, and whether reminders are off. */
export interface BackupMemo { at: number; snooze: number; off: boolean }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export function readMemo(v: unknown): BackupMemo {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { at: num(o.at), snooze: num(o.snooze), off: o.off === true };
}

export interface Usage { tasks: number; sessions: number; since: number }

/** Your own tasks and sessions, and when the earliest of them began. */
export function usage(tasks: Iterable<Task>): Usage {
  const u = { tasks: 0, sessions: 0, since: 0 };
  const seen = (t: number) => { if (t > 0 && (!u.since || t < u.since)) u.since = t; };
  for (const t of tasks) {
    if (!t || t.sample || t.system) continue;
    u.tasks++;
    seen(num(t.createdAt));
    for (const s of Array.isArray(t.sessions) ? t.sessions : []) { u.sessions++; seen(num(s?.at)); }
  }
  return u;
}

/** Twenty sessions, or five tasks over at least a week. */
export const worthKeeping = (u: Usage, now: number) => u.sessions >= 20 || (u.tasks >= 5 && u.since > 0 && now - u.since >= 7 * DAY);

export interface RemindInput { now: number; memo: BackupMemo; usage: Usage; signedIn: boolean }

export function remindDue({ now, memo, usage: u, signedIn }: RemindInput): boolean {
  if (signedIn || memo.off || now < memo.snooze) return false;
  if (memo.at && now - memo.at < EVERY_DAYS * DAY) return false;
  return worthKeeping(u, now);
}

export const snoozed = (m: BackupMemo, now: number): BackupMemo => ({ ...m, snooze: now + SNOOZE_DAYS * DAY });

export function daysAgo(at: number, now: number): string {
  const d = Math.max(0, Math.round((sod(now) - sod(at)) / DAY));
  return d === 0 ? "today" : d === 1 ? "yesterday" : d + " days ago";
}

export const lastBackup = (at: number, now: number) => (at ? "Last backup: " + daysAgo(at, now) : "Never backed up");

export const promptText = (at: number, now: number) => "Back up your ledger? " + (at ? "Last backup " + daysAgo(at, now) + "." : "No backup on this device yet.");
