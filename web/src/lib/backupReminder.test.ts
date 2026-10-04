import { describe, expect, it } from "vitest";
import { daysAgo, lastBackup, promptText, readMemo, remindDue, snoozed, usage, worthKeeping, type BackupMemo, type Usage } from "./backupReminder";
import type { Task } from "./tasks";

const DAY = 864e5;
const NOW = new Date(2026, 9, 4, 15, 0).getTime();
const ago = (d: number) => NOW - d * DAY;
const memo = (o: Partial<BackupMemo> = {}): BackupMemo => ({ at: 0, snooze: 0, off: false, ...o });
const busy: Usage = { tasks: 12, sessions: 40, since: ago(60) };
const due = (o: Partial<Parameters<typeof remindDue>[0]> = {}) => remindDue({ now: NOW, memo: memo(), usage: busy, signedIn: false, ...o });

describe("readMemo", () => {
  it("fills in what's missing or broken", () => {
    expect(readMemo(null)).toEqual(memo());
    expect(readMemo("x")).toEqual(memo());
    expect(readMemo({ at: "5", snooze: -1, off: "yes" })).toEqual(memo());
    expect(readMemo({ at: 5, snooze: 9, off: true })).toEqual({ at: 5, snooze: 9, off: true });
  });
});

describe("usage", () => {
  it("counts your own tasks and sessions and finds the earliest one", () => {
    const tasks: Task[] = [
      { id: "a", title: "a", createdAt: ago(3), sessions: [{ at: ago(10) }, { at: ago(2) }] },
      { id: "b", title: "b", createdAt: ago(5) },
      { id: "s", title: "s", sample: true, createdAt: ago(90), sessions: [{ at: ago(90) }] },
      { id: "y", title: "y", system: true, createdAt: ago(80) },
    ];
    expect(usage(tasks)).toEqual({ tasks: 2, sessions: 2, since: ago(10) });
  });

  it("is empty with no tasks", () => {
    expect(usage([])).toEqual({ tasks: 0, sessions: 0, since: 0 });
  });
});

describe("worthKeeping", () => {
  it("needs twenty sessions or five tasks over a week", () => {
    expect(worthKeeping({ tasks: 1, sessions: 20, since: ago(1) }, NOW)).toBe(true);
    expect(worthKeeping({ tasks: 5, sessions: 0, since: ago(7) }, NOW)).toBe(true);
    expect(worthKeeping({ tasks: 5, sessions: 19, since: ago(6) }, NOW)).toBe(false);
    expect(worthKeeping({ tasks: 4, sessions: 19, since: ago(60) }, NOW)).toBe(false);
    expect(worthKeeping({ tasks: 0, sessions: 0, since: 0 }, NOW)).toBe(false);
  });
});

describe("remindDue", () => {
  it("reminds when there's real data and no recent backup", () => {
    expect(due()).toBe(true);
    expect(due({ memo: memo({ at: ago(30) }) })).toBe(true);
  });

  it("waits thirty days after an export", () => {
    expect(due({ memo: memo({ at: ago(29) }) })).toBe(false);
    expect(due({ memo: memo({ at: NOW + DAY }) })).toBe(false);
  });

  it("stays quiet while snoozed, and after", () => {
    const later = snoozed(memo({ at: ago(40) }), NOW);
    expect(later.snooze).toBe(NOW + 7 * DAY);
    expect(due({ memo: later })).toBe(false);
    expect(due({ memo: later, now: NOW + 7 * DAY - 1 })).toBe(false);
    expect(due({ memo: later, now: NOW + 7 * DAY })).toBe(true);
  });

  it("never reminds when turned off or signed in", () => {
    expect(due({ memo: memo({ off: true }) })).toBe(false);
    expect(due({ signedIn: true })).toBe(false);
  });

  it("waits for enough data", () => {
    expect(due({ usage: { tasks: 3, sessions: 4, since: ago(60) } })).toBe(false);
  });
});

describe("copy", () => {
  it("says how long ago in calendar days", () => {
    expect(daysAgo(NOW - 60000, NOW)).toBe("today");
    expect(daysAgo(new Date(2026, 9, 3, 23, 50).getTime(), NOW)).toBe("yesterday");
    expect(daysAgo(ago(12), NOW)).toBe("12 days ago");
    expect(daysAgo(NOW + DAY, NOW)).toBe("today");
  });

  it("reads plainly", () => {
    expect(lastBackup(0, NOW)).toBe("Never backed up");
    expect(lastBackup(ago(12), NOW)).toBe("Last backup: 12 days ago");
    expect(promptText(ago(34), NOW)).toBe("Back up your ledger? Last backup 34 days ago.");
    expect(promptText(0, NOW)).toBe("Back up your ledger? No backup on this device yet.");
  });
});
