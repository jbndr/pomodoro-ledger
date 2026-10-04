import { toast } from "../chrome/notice.svelte";
import { plural } from "../format";
import { catchUp } from "../lib/repeat";
import { carriedOver, leftovers, leftoverText, rolloverMode } from "../lib/rollover";
import { renderTasks } from "../render";
import { ls, S } from "../state";
import { Store } from "../store";
import { preview, todayKey } from "./derived";

let asked: string[] = [];

const settle = () => { ls.set("pl.day", todayKey()); asked = []; };

/** Moves recurring tasks forward and handles leftovers once a day; waits for the first sync so it never acts on stale tasks. */
export function newDay() {
  if (preview() || (Store.col && S.storeMode !== "db")) return;
  const tk = todayKey(), { save, drop } = catchUp(S.tasks.values(), tk);
  drop.forEach((id) => Store.deleteTask(id));
  if (save.length) Store.saveTasks(save);
  if (ls.get("pl.day", "") === tk) return;
  const ids = leftovers(S.tasks.values(), tk).map((t) => t.id), mode = rolloverMode(S.settings.rollover);
  if (!ids.length || mode === "never") return settle();
  if (mode === "always") { moveLeftovers(ids); return; }
  if (asked.join() !== ids.join()) { asked = ids; renderTasks(); }
}

/** The Ask prompt for Today, or null. */
export function leftoverPrompt() {
  const tk = todayKey(), list = leftovers(S.tasks.values(), tk).filter((t) => asked.includes(t.id));
  return list.length && S.taskView === "today" ? { text: leftoverText(list, tk) + ".", n: list.length } : null;
}

function moveLeftovers(ids: string[]) {
  const tk = todayKey(), list = leftovers(S.tasks.values(), tk).filter((t) => ids.includes(t.id));
  settle();
  if (!list.length) { renderTasks(); return; }
  Store.saveTasks(list.map((t) => carriedOver(t, tk)));
  toast("Moved " + plural(list.length, "unfinished task") + " to today.");
}

export const moveAsked = () => moveLeftovers(asked);
export const leaveAsked = () => { settle(); renderTasks(); };
