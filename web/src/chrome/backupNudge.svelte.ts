import { Cloud } from "../cloud";
import { readMemo, remindDue, snoozed, usage, type BackupMemo } from "../lib/backupReminder";
import { DEMO, ls, S, T } from "../state";
import { Store } from "../store";
import { preview } from "../tasks/derived";
import { fsEl } from "../zen";

const KEY = "pl.backup";

let memo = $state(readMemo(ls.get(KEY, null))), shown = $state(false), now = $state(Date.now()), asked = false;

export const nudge = {
  get memo() { return memo; },
  get shown() { return shown; },
  get now() { return now; },
};

const save = (m: BackupMemo) => { memo = m; now = Date.now(); ls.set(KEY, m); };
const reload = () => { memo = readMemo(ls.get(KEY, null)); now = Date.now(); };

export const signedIn = () => !!Cloud.email || !!Store.col;

const busy = () =>
  T.status === "running" || document.body.classList.contains("zen") || !!fsEl() ||
  !!document.querySelector(".overlay:not([hidden]), dialog[open]") ||
  !!document.activeElement?.matches("input, textarea, select, [contenteditable]");

/** Shows the backup prompt once per visit, when it's due and nothing else is going on. */
export function maybeRemind() {
  if (asked || DEMO || preview() || busy()) return;
  reload();
  if (!remindDue({ now, memo, usage: usage(S.tasks.values()), signedIn: signedIn() })) return;
  asked = shown = true;
}

export function noteExport() { save({ ...memo, at: Date.now() }); shown = false; }
export function later() { save(snoozed(memo, Date.now())); shown = false; }
export function setReminders(on: boolean) { save({ ...memo, off: !on }); if (!on) shown = false; }
export const refreshNudge = reload;
