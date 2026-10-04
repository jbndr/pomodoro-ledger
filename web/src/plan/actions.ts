import { toast } from "../chrome/notice.svelte";
import { plural } from "../format";
import { addDays, dayKey, sod, type DayKey } from "../lib/dates";
import { weekStart } from "../lib/insights";
import { cleanPlans, objectiveFor, objectiveProgress, offerDue, planOf, rehome, settle, withPlan, type Fate, type Objective } from "../lib/weekPlan";
import { renderAll } from "../render";
import { DEMO, S, type Task } from "../state";
import { Store } from "../store";
import { guardPreview, preview, todayKey, unplanned, viewTasks } from "../tasks/derived";
import { saveTimer } from "../timer/engine";

export const plans = () => cleanPlans(S.settings.plans);
export const currentPlan = () => planOf(plans(), dayKey(weekStart(Date.now())));

/** This week's objectives with their progress so far, or null without a plan. */
export function weekGoals(tasks: Map<string, Task>) {
  const plan = currentPlan();
  return plan ? { plan, goals: objectiveProgress(tasks, plan) } : null;
}

/** Looks up the objective a task serves, with this week's progress; built once per list render. */
export function goalLookup(tasks: Map<string, Task>) {
  const w = weekGoals(tasks);
  return (t: Task) => {
    const o = w && objectiveFor(w.plan, t);
    return o ? w!.goals.find((g) => g.label === o.label)! : null;
  };
}

/** Saves the week's objectives and settles each leftover; a dropped task's focus stays in the history. */
export function savePlan(week: DayKey, objectives: Objective[], fates: Record<string, Fate>) {
  if (guardPreview()) return false;
  const tk = todayKey(), save: Task[] = [], buckets = new Map<string, Task>(), n = { week: 0, later: 0, drop: 0 };
  for (const [id, fate] of Object.entries(fates)) {
    const t = S.tasks.get(id);
    if (!t || t.done) continue;
    n[fate]++;
    if (fate !== "drop") { save.push(settle(t, fate, week, tk)); continue; }
    for (const u of rehome(t, (at) => buckets.get(unplanned(at).id) || unplanned(at))) buckets.set(u.id, u);
    if (S.activeId === id) { S.activeId = null; saveTimer(); }
    Store.deleteTask(id, false);
  }
  S.settings.plans = withPlan(plans(), { week, objectives, at: Date.now() });
  S.settings.planSeen = week;
  Store.saveSettings();
  const changed = [...save, ...buckets.values()];
  if (changed.length) Store.saveTasks(changed); else renderAll();
  const moved = [n.week && plural(n.week, "task") + " rolled over", n.later && n.later + " moved to Later", n.drop && n.drop + " dropped"].filter(Boolean);
  toast((objectives.length ? "Week planned with " + plural(objectives.length, "objective") + "." : "Week planned.") + (moved.length ? " " + moved.join(", ") + "." : ""));
  return true;
}

/** The week to offer planning for, if this ledger is in use: open tasks or focus in the last two weeks. */
export function planDue(): DayKey | null {
  if (S.settings.weeklyPlan === false || (preview() && !DEMO)) return null;
  const now = Date.now(), week = offerDue(now, plans(), S.settings.planSeen), since = addDays(sod(now), -14);
  if (!week) return null;
  return [...viewTasks().values()].some((t) => (!t.done && !t.system) || (t.sessions || []).some((s) => s.at >= since)) ? week : null;
}

/** Hides the prompt for a week without planning it. */
export function waveOff(week: DayKey) {
  S.settings.planSeen = week;
  Store.saveSettings();
}

export function stopOffering() {
  S.settings.weeklyPlan = false;
  Store.saveSettings();
  toast("Weekly planning won't be offered. Turn it back on in Settings → Automation, or press P any time.");
}
