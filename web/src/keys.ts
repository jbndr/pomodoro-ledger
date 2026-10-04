import { toast } from "./chrome/notice.svelte";
import { $, taskRow, taskRows } from "./dom";
import { phone, showPage } from "./pages";
import { S } from "./state";
import { focusRow, scheduleTask } from "./tasks/actions";
import { groupName, guardPreview, quickDays } from "./tasks/derived";
import { adjust, skip, toggle } from "./timer/engine";
import { closeKeys, closeRoom, closeSettings, openKeys, openWhen, ui } from "./ui";
import { toggleZen } from "./zen";

// Scheduling shortcuts act on the task under the mouse or keyboard focus, else the one you're working on.
let hoverTask = "";
export const setHover = (id: string) => { hoverTask = id; };

function shortcutTask() {
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest<HTMLElement>("#taskList .task");
  const id = focused ? focused.dataset.id : hoverTask || S.activeId;
  const t = id && S.tasks.get(id);
  return t && !t.done && !t.system ? t : null;
}

// ⌥↑/⌥↓ move a task one place (past a heading counts as a step); with ⇧ it jumps a whole section, or a day in Upcoming.
function moveTaskKey(up: boolean, far: boolean) {
  const t = shortcutTask();
  if (!t) { toast("Point at a task or pick one to work on first."); return; }
  if (guardPreview()) return;
  if (S.projectFilter) { toast("Show all tasks to reorder."); return; }
  const moved = ui.list!.moveTask(t.id, up, far);
  if (!moved) return;
  if (moved.to !== moved.from) toast("Moved “" + t.title + "” to " + groupName(moved.to) + ".");
  focusRow(taskRow(t.id));
}

function scheduleShortcut(key: string) {
  const t = shortcutTask();
  if (!t) { toast("Point at a task, or pick one to work on, then press " + key.toUpperCase() + "."); return; }
  if (guardPreview()) return;
  const q = quickDays();
  if (key === "d") {
    const row = taskRow(t.id);
    openWhen(row ? row.querySelector("[data-sched]") || row : $("#taskPick"), t);
    return;
  }
  scheduleTask(t.id, ({ t: q.today, m: q.tomorrow, w: q.week, l: q.later } as Record<string, string>)[key]);
}

/** The app-wide keyboard shortcuts. */
export function onKey(e: KeyboardEvent) {
  const tag = ((e.target as Element).tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea" || !$("#settings").hidden || !$("#room").hidden || !$("#keys").hidden) {
    if (e.key === "Escape") { if (!$("#settings").hidden) closeSettings(); else if (!$("#room").hidden) closeRoom(); else if (!$("#keys").hidden) closeKeys(); }
    return;
  }
  const zen = () => document.body.classList.contains("zen");
  if (e.key === "?" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openKeys(); return; }
  if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey && !zen()) {
    e.preventDefault();
    if (phone()) showPage("tasks");
    $("#newTitle").focus();
    return;
  }
  if (e.code === "Space" && tag !== "button") { e.preventDefault(); toggle(); }
  else if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey) skip();
  else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleZen(e.shiftKey);
  else if ((e.key === "+" || e.key === "=") && !e.metaKey && !e.ctrlKey) adjust(1);
  else if (e.key === "-" && !e.metaKey && !e.ctrlKey) adjust(-1);
  else if (e.key === "Escape" && zen()) toggleZen(false);
  else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.altKey && !e.metaKey && !e.ctrlKey && !zen()) { e.preventDefault(); moveTaskKey(e.key === "ArrowUp", e.shiftKey); }
  else if (/^[tmwld]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !zen()) { e.preventDefault(); scheduleShortcut(e.key.toLowerCase()); }
  else if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !zen() && !$("#taskList").contains(document.activeElement)) {
    const rows = taskRows();
    if (!rows.length) return;
    e.preventDefault();
    const start = rows.find((li) => li.dataset.id === (hoverTask || S.activeId));
    focusRow(start || (e.key === "ArrowUp" || e.key === "k" ? rows.at(-1) : rows[0]));
  }
}
