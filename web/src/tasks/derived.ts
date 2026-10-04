import { toast } from "../chrome/notice.svelte";
import { fmtDate } from "../format";
import { addDays, dayKey, keyTime, nextMonday, sod } from "../lib/dates";
import { labelHue, matchLabel, projectNames, projectOf, timeOf } from "../lib/tasks";
import { renderAll } from "../render";
import { clone, DEMO, ls, S, type Task, type View } from "../state";
import { makeSamples, samplePlans } from "./samples";

let SAMPLES: Map<string, Task> | null = null;
export const preview = () => DEMO || (!S.started && S.tasks.size === 0);
export const viewTasks = () => (preview() ? (SAMPLES || (SAMPLES = makeSamples())) : S.tasks);

export function enterDemo() { SAMPLES = makeSamples(true); S.tasks = SAMPLES; S.activeId = "x6"; S.started = true; S.settings.plans = samplePlans(); }

export function markStarted(silent?: boolean) {
  if (S.started) return;
  S.started = true; ls.set("pl.started", true);
  if (S.activeId && S.activeId.startsWith("x")) S.activeId = null;
  if (!silent) renderAll();
}

export const guardPreview = () => { if (preview() && !DEMO) { toast("These are examples. Add a task to start your own ledger."); return true; } return false; };

export const ord = (t: Task) => (t.order ?? t.createdAt) as number;
export const todayKey = () => dayKey(Date.now());
// Planned days that have arrived (or passed) count as today, so nothing has to flip at midnight.
export const bucketOf = (t: Task, tk = todayKey()): View => (t.today || (t.plan && t.plan <= tk) ? "today" : t.plan ? "upcoming" : "later");
export const isToday = (t: Task) => bucketOf(t) === "today";
// Optional headings inside Today ("Morning", "Admin"…). They persist across days and sync with settings.
export const sections = () => (Array.isArray(S.settings.sections) ? S.settings.sections : []);
const secRank = (t: Task) => { const i = sections().findIndex((x) => x.id === t.section); return i < 0 ? 0 : i + 1; };
const RANK = { today: 0, upcoming: 1, later: 2 };
export const openOf = (vt: Map<string, Task>) => {
  const tk = todayKey();
  return [...vt.values()].filter((t) => !t.done && !t.system).sort((a, b) => {
    const ba = bucketOf(a, tk), bb = bucketOf(b, tk);
    return RANK[ba] - RANK[bb] || (ba === "upcoming" ? a.plan!.localeCompare(b.plan!) : ba === "today" ? secRank(a) - secRank(b) : 0) || ord(a) - ord(b);
  });
};

export function dayName(k: string) {
  const days = Math.round((keyTime(k) - sod(Date.now())) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return (days === 7 ? "Next " : "") + fmtDate(keyTime(k), { weekday: "long" });
  return fmtDate(keyTime(k), { weekday: "short", day: "numeric", month: "short" });
}
export const shortDay = (k: string) => fmtDate(keyTime(k), { weekday: "short" }) + " " + new Date(keyTime(k)).getDate();

// g is a list group: "today", "sec:<id>" (a section in Today), "later", or a YYYY-MM-DD day.
export function placed(t: Task, g: string, order: number) {
  const sec = g.startsWith("sec:") ? g.slice(4) : "";
  const n: Task = { ...clone(t), order, today: g === "today" || !!sec };
  // Today's tasks keep the day they were planned for, so tomorrow they count as leftovers.
  if (n.today) n.plan = todayKey(); else if (g === "later") delete n.plan; else n.plan = g;
  if (sec) n.section = sec; else delete n.section;
  return n;
}
export const inGroup = (t: Task, g: string) => (g === "today" ? isToday(t) : g.startsWith("sec:") ? isToday(t) && t.section === g.slice(4) : g === "later" ? bucketOf(t) === "later" : bucketOf(t) === "upcoming" && t.plan === g);
export const groupName = (g: string) => (g === "today" ? "Today" : g === "later" ? "Later" : g.startsWith("sec:") ? sections().find((x) => x.id === g.slice(4))?.title || "section" : dayName(g));
export const viewOf = (g: string) => (g === "later" ? g : g === "today" || g.startsWith("sec:") ? "today" : "upcoming");
export const quickDays = () => { const now = Date.now(); return { today: "today", tomorrow: dayKey(addDays(now, 1)), week: nextMonday(now), later: "later" }; };

export const unplanned = (at: number): Task => {
  const id = "unplanned-" + dayKey(at).slice(0, 7);
  return S.tasks.get(id) || { id, title: "Unplanned focus", system: true, est: 0, done: false, createdAt: at, sessions: [] };
};

export const inProject = (t: Task) => matchLabel(t, S.projectFilter);
export const filterLabel = () => (S.projectFilter.startsWith("project:") ? S.projectFilter.slice(8) : "");
export const labelHidden = (name: string) => S.labels.some((l) => l.archived && l.name.toLocaleLowerCase() === name.toLocaleLowerCase());
export const labelChipName = (name: string) => (name ? "Label: " + name + ". Change label" : "Add a label");
export const subsOf = (t: Task) => (Array.isArray(t.subtasks) ? t.subtasks : []);

/** The task list's counts and label filter chips. */
export function listHead() {
  const vt = viewTasks(), projects = projectNames(vt), f = S.projectFilter;
  const allOpen = openOf(vt), open = allOpen.filter(inProject);
  const openIn = (name: string) => allOpen.filter((t) => projectOf(t) === name).length, unlabeled = allOpen.filter((t) => !projectOf(t)).length;
  const chips: { v: string; name: string; n: number; hue?: number }[] = [
    { v: "", name: "All", n: allOpen.length },
    ...projects.filter((name) => openIn(name) || f === "project:" + name || !labelHidden(name)).map((name) => ({ v: "project:" + name, name, n: openIn(name), hue: labelHue(name) })),
    ...(unlabeled || f === "none" ? [{ v: "none", name: "No label", n: unlabeled }] : []),
  ];
  const selected = [...vt.values()].filter((t) => !t.system && inProject(t));
  const tk = todayKey(), byView = { today: 0, upcoming: 0, later: 0 };
  open.forEach((t) => byView[bucketOf(t, tk)]++);
  return {
    view: S.taskView, filter: f, labeled: projects.length > 0, chips, byView,
    open: open.length, done: selected.filter((t) => t.done).length, focus: selected.reduce((sum, t) => sum + timeOf(t), 0),
  };
}
