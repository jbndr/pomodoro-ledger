import { toast } from "../chrome/notice.svelte";
import { $, calm, taskRow, taskRows } from "../dom";
import { fmtDur, plural } from "../format";
import { addDays, dayKey } from "../lib/dates";
import type { Placement } from "../lib/order";
import { nextOccurrence, repeatText, seriesOf, withRepeat, type Repeat } from "../lib/repeat";
import { cyclesOf, projectOf, timeOf, type Subtask } from "../lib/tasks";
import { phone, showPage } from "../pages";
import { whenPop } from "../popovers/state.svelte";
import { renderTasks } from "../render";
import { playSound } from "../sound";
import { clone, S, T, type Section, type Task } from "../state";
import { Labels, Store } from "../store";
import { saveTimer, setMode, start } from "../timer/engine";
import { closeWhen, openLabelPop, openWhen } from "../ui";
import { dayName, guardPreview, inGroup, inProject, isToday, markStarted, openOf, ord, placed, preview, sections, shortDay, subsOf, todayKey, topOfToday, viewOf, viewTasks } from "./derived";

/** Slides rows out of the list before `done` saves the change that removes them. */
function leaveRows(ids: string[], done: () => void) {
  const rows = taskRows().filter((li) => ids.includes(li.dataset.id!));
  if (!rows.length || calm()) return done();
  rows.forEach((li) => {
    li.style.overflow = "hidden";
    li.animate([{ height: li.offsetHeight + "px", opacity: 1, transform: "none" }, { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", transform: "translateX(18px)" }], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "forwards" });
  });
  // A timer rather than the animation's promise: animations pause in background tabs.
  setTimeout(done, 250);
}

export function scheduleTask(id: string, g: string) {
  const t = S.tasks.get(id);
  if (!t) return;
  if (g !== "today" && g !== "later" && g <= todayKey()) g = "today";
  const where = g === "later" ? "Later" : dayName(g === "today" ? todayKey() : g);
  if (inGroup(t, g) && !(g === "today" && t.plan && t.plan < todayKey())) { toast("“" + t.title + "” is already in " + where + "."); return; }
  const last = Math.max(-1, ...openOf(S.tasks).filter((x) => x.id !== id && inGroup(x, g)).map(ord));
  const save = () => { Store.saveTask(placed(t, g, last + 1)); toast("Moved “" + t.title + "” to " + where + "."); };
  if (viewOf(g) !== S.taskView) leaveRows([id], save); else save();
}

export function moveToTomorrow(ids: string[]) {
  ids = ids.filter((id) => S.tasks.has(id));
  if (!ids.length) return;
  const tomorrow = dayKey(addDays(Date.now(), 1));
  let last = Math.max(-1, ...openOf(S.tasks).filter((x) => inGroup(x, tomorrow)).map(ord));
  leaveRows(ids, () => {
    Store.saveTasks(ids.map((id) => placed(S.tasks.get(id)!, tomorrow, ++last)));
    toast("Moved " + plural(ids.length, "task") + " to tomorrow.");
  });
}

export function commitPlacements(order: Placement[]) {
  const changed: Task[] = [];
  for (const p of order) {
    const t = S.tasks.get(p.id);
    if (!t) continue;
    const n = placed(t, p.end && t.plan && t.plan >= p.g && t.plan <= p.end ? t.plan : p.g, p.order);
    if (n.today && isToday(t)) { if (t.plan) n.plan = t.plan; else delete n.plan; }
    if (t.order !== p.order || !!t.today !== n.today || (t.plan || "") !== (n.plan || "") || (t.section || "") !== (n.section || "")) changed.push(n);
  }
  if (changed.length) Store.saveTasks(changed); else renderTasks();
}

export function addTask(title: string, est: number, into: string, notes: string, repeat?: Repeat | null) {
  markStarted(true);
  const id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const last = Math.max(-1, ...openOf(S.tasks).filter((x) => inGroup(x, into)).map(ord));
  const t = placed({ id, title, est, done: false, createdAt: Date.now(), doneAt: null, sessions: [], subtasks: [], ...(notes ? { notes } : {}) }, into, last + 1);
  if (S.newLabel) t.project = Labels.use(S.newLabel);
  if (repeat) t.repeat = repeat;
  if (!S.activeId || !S.tasks.get(S.activeId) || S.tasks.get(S.activeId)!.done) { S.activeId = id; saveTimer(); }
  if (!inProject(t)) S.projectFilter = "";
  Store.saveTask(t);
  toast("Added “" + title + "”" + (t.project ? " to " + t.project : "") + " · " + (into === "later" ? "Later" : dayName(into === "today" ? todayKey() : into)) + ".");
}

/** Keeps the timer on the top of Today; a running focus round keeps its task until it ends. */
export function syncActive() {
  const top = topOfToday()?.id ?? null;
  if (top === S.activeId) return;
  const cur = S.activeId ? viewTasks().get(S.activeId) : null;
  if (T.mode === "focus" && T.status === "running" && cur && !cur.done) return;
  S.activeId = top;
  if (!preview()) saveTimer();
}

export function setActive(id: string) {
  if (preview()) { markStarted(); return; }
  S.activeId = id || null; saveTimer(); renderTasks();
}

const focusAddSubtask = (id: string) => taskRow(id)?.querySelector<HTMLElement>(".subtask-add input")?.focus();

export function addSubtasks(id: string, titles: string[]) {
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t);
  n.subtasks = [...(n.subtasks || []), ...titles.map((title) => ({ id: crypto.randomUUID(), title: title.slice(0, 140), done: false }))];
  S.subtaskDrafts.delete(id);
  Store.saveTask(n);
}

export function editSubtask(id: string, subid: string, edit: (s: Subtask) => void) {
  if (guardPreview()) return;
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t), sub = (n.subtasks || []).find((s) => s.id === subid);
  if (!sub) return;
  edit(sub);
  Store.saveTask(n);
}

export function renameSubtask(id: string, subid: string, input: HTMLInputElement) {
  const t = S.tasks.get(id), sub = t && subsOf(t).find((s) => s.id === subid), title = input.value.trim();
  if (!sub) return;
  if (!title) { input.value = sub.title; return; }
  if (title !== sub.title) editSubtask(id, subid, (s) => { s.title = title; });
}

export function deleteSubtask(id: string, subid: string) {
  if (guardPreview()) return;
  const t = S.tasks.get(id);
  if (!t) return;
  const n = clone(t);
  n.subtasks = (n.subtasks || []).filter((s) => s.id !== subid);
  Store.saveTask(n);
  focusAddSubtask(id);
}

function saveSections(next: Section[]) { S.settings.sections = next; Store.saveSettings(); renderTasks(); }

export function moveSection(id: string, to: number) {
  const all = sections(), from = all.findIndex((x) => x.id === id);
  if (from < 0 || to < 0 || to >= all.length || to === from) return false;
  const next = [...all]; next.splice(to, 0, next.splice(from, 1)[0]);
  saveSections(next);
  return true;
}

export function renameSection(input: HTMLInputElement) {
  const all = sections(), sec = all.find((x) => x.id === input.dataset.sec), title = input.value.trim();
  if (!sec) return;
  if (!title) { input.value = sec.title; return; }
  if (title !== sec.title) saveSections(all.map((x) => (x === sec ? { ...x, title } : x)));
}

export function addSection() {
  if (guardPreview()) return;
  const id = "s" + Date.now().toString(36);
  saveSections([...sections(), { id, title: "New section" }]);
  const input = $<HTMLInputElement>('#taskList [data-sec="' + id + '"]');
  if (input) { input.focus(); input.select(); }
}

export function removeSection(id: string) {
  if (guardPreview()) return;
  const sec = sections().find((x) => x.id === id);
  saveSections(sections().filter((x) => x !== sec));
  if (sec) toast("Removed “" + sec.title + "”. Its tasks stay in Today.");
}

export const completing = new Map<string, ReturnType<typeof setTimeout>>();

export function completeTask(id: string) {
  if (guardPreview()) return;
  // A short pause before the task leaves, so a slipped click can be taken back.
  if (completing.has(id)) { clearTimeout(completing.get(id)); completing.delete(id); renderTasks(); return; }
  if (!S.tasks.get(id)) return;
  playSound("task");
  completing.set(id, setTimeout(() => {
    completing.delete(id);
    const cur = S.tasks.get(id); if (!cur || cur.done) return;
    if (S.openTask === id) S.openTask = null;
    leaveRows([id], () => {
      const n = clone(cur); n.done = true; n.doneAt = Date.now();
      if (S.activeId === id) { S.activeId = openOf(S.tasks).find((task) => task.id !== id)?.id || null; saveTimer(); }
      const next = nextOccurrence(n, todayKey());
      const fresh = next && !S.tasks.has(next.id) && !openOf(S.tasks).some((x) => x.id !== id && seriesOf(x) === next.series);
      Store.saveTasks(fresh ? [n, next!] : [n]);
      toast("Finished “" + cur.title + "” in " + plural(cyclesOf(cur), "cycle") + " · " + fmtDur(timeOf(cur)) + " of focus." + (fresh ? " Next: " + shortDay(next!.plan!) + "." : ""));
    });
  }, 900));
  renderTasks();
}

export function focusOnTask(id: string) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const top = topOfToday(S.tasks);
  if (top?.id !== id) {
    const first = Math.min(0, ...openOf(S.tasks).filter((x) => isToday(x)).map(ord));
    Store.saveTask(placed(t, "today", first - 1));
  }
  S.activeId = id; saveTimer(); renderTasks();
  if (T.mode !== "focus") setMode("focus", true);
  if (T.status !== "running") start();
  if (phone()) showPage("timer");
}

export function labelTask(id: string) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const find = () => taskRow(id)?.querySelector<HTMLElement>("[data-act='label']");
  openLabelPop("row:" + id, find, projectOf(t), (name) => {
    const cur = S.tasks.get(id);
    if (!cur || name === projectOf(cur)) return;
    const n = clone(cur);
    if (name) n.project = Labels.use(name); else delete n.project;
    Store.saveTask(n);
    find()?.focus();
  });
}

export function schedTask(anchor: Element, id: string) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  if (!whenPop.hidden) { closeWhen(); return; }
  openWhen(anchor, t);
}

let delTimer: ReturnType<typeof setTimeout> | undefined;
export function deleteTask(id: string) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  clearTimeout(delTimer);
  if (S.confirmDel === id) { S.confirmDel = null; if (S.openTask === id) S.openTask = null; if (S.activeId === id) { S.activeId = null; saveTimer(); } Store.deleteTask(id); toast("Deleted “" + t.title + "”."); }
  else { S.confirmDel = id; renderTasks(); delTimer = setTimeout(() => { S.confirmDel = null; renderTasks(); }, 3000); }
}

export function setRepeat(id: string, r: Repeat | null) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const n = withRepeat(clone(t), r, todayKey());
  Store.saveTask(n);
  toast(r ? "“" + t.title + "” repeats e" + repeatText(r).slice(1) + "." + (n.plan === todayKey() ? "" : " Next: " + shortDay(n.plan!) + ".") : "“" + t.title + "” no longer repeats.");
}

export function setEstimate(id: string, est: number) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t || (t.est || 0) === est) return;
  const n = clone(t); n.est = est; Store.saveTask(n);
}

export function reopenTask(id: string) {
  const t = S.tasks.get(id);
  if (guardPreview() || !t) return;
  const n = clone(t); n.done = false; n.doneAt = null;
  const next = t.repeat ? nextOccurrence(t, todayKey()) : null, unused = next && S.tasks.get(next.id);
  if (unused && !unused.done && !(unused.sessions || []).length) Store.deleteTask(unused.id);
  Store.saveTask(n);
  toast("Moved “" + t.title + "” back to open tasks.");
}

export function focusRow(li: HTMLElement | undefined) {
  if (!li) return;
  if (phone() && document.body.dataset.page !== "tasks") showPage("tasks");
  li.focus({ preventScroll: true });
  li.scrollIntoView({ block: "nearest" });
}

export function toggleCard(id: string, focusTitle?: boolean) {
  S.openTask = S.openTask === id ? null : id;
  S.confirmDel = null;
  renderTasks();
  const li = taskRow(id);
  if (!li) return;
  if (S.openTask && focusTitle) li.querySelector<HTMLElement>(".card-title")?.focus();
  else if (!S.openTask) li.focus({ preventScroll: true });
}

type Field = HTMLInputElement | HTMLTextAreaElement;
export function saveField(input: Field) {
  const id = input.closest<HTMLElement>(".task")?.dataset.id, t = id && S.tasks.get(id);
  if (!t || guardPreview()) return;
  const field = input.dataset.field as "title" | "notes", value = field === "title" ? input.value.trim() : input.value.replace(/\s+$/, "");
  if (field === "title" && !value) { input.value = t.title; return; }
  if ((t[field] || "") === value) return;
  const n = clone(t);
  if (value) n[field] = value; else delete n[field];
  Store.saveTask(n, false);
  if (field === "title") renderTasks();
}

/** Closes the open task card on a press anywhere outside it, saving the field being edited. */
export function dismissCard(e: PointerEvent) {
  if (!S.openTask || (e.target as Element).closest(".task.open, #whenPop, #labelPop, #pop, .toast")) return;
  const el = document.activeElement; if (el && el.matches && el.matches("[data-field]")) saveField(el as Field);
  S.openTask = null; S.confirmDel = null; renderTasks();
}
