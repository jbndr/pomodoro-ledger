import { addDays, dayKey, keyTime, type DayKey } from "./dates";
import { weekday, weekStart } from "./insights";
import { sameLabel, type Label } from "./labels";
import { carriedOver } from "./rollover";
import { projectOf, sessionProject, type Task, type Tasks } from "./tasks";

export interface Objective { label: string; target: number; name?: string }

/** The objectives for the week starting on `week`, a Monday. */
export interface WeekPlan { week: DayKey; objectives: Objective[]; at: number }

export const MAX_OBJECTIVES = 3;
export const TARGET = { min: 1, max: 60 };
const KEEP_WEEKS = 12;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function cleanObjective(raw: unknown): Objective | null {
  if (!isObj(raw) || typeof raw.label !== "string" || !raw.label.trim()) return null;
  const target = Math.round(Number(raw.target));
  if (!Number.isFinite(target)) return null;
  const o: Objective = { label: raw.label.trim().slice(0, 80), target: Math.max(TARGET.min, Math.min(TARGET.max, target)) };
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
  if (name) o.name = name;
  return o;
}

/** Plans from storage or another device: valid ones only, one per week, the newest few weeks. */
export function cleanPlans(raw: unknown): WeekPlan[] {
  const byWeek = new Map<DayKey, WeekPlan>();
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!isObj(p) || typeof p.week !== "string" || !/^\d{4}-\d\d-\d\d$/.test(p.week)) continue;
    const objectives: Objective[] = [];
    for (const o of Array.isArray(p.objectives) ? p.objectives : []) {
      const c = cleanObjective(o);
      if (c && objectives.length < MAX_OBJECTIVES && !objectives.some((x) => sameLabel(x.label, c.label))) objectives.push(c);
    }
    const at = typeof p.at === "number" && Number.isFinite(p.at) ? p.at : 0, old = byWeek.get(p.week);
    if (objectives.length && (!old || at >= old.at)) byWeek.set(p.week, { week: p.week, objectives, at });
  }
  return [...byWeek.values()].sort((a, b) => (a.week < b.week ? -1 : 1)).slice(-KEEP_WEEKS);
}

export const planOf = (plans: WeekPlan[], week: DayKey): WeekPlan | null => plans.find((p) => p.week === week) || null;

/** Plans with `plan` replacing its week; a plan without objectives clears the week. */
export const withPlan = (plans: WeekPlan[], plan: WeekPlan): WeekPlan[] => cleanPlans([...plans.filter((p) => p.week !== plan.week), plan]);

/** The week a plan made now is for: on Sundays the coming one, otherwise the current one. */
export const planWeek = (now: number): number => (weekday(now) === 6 ? addDays(weekStart(now), 7) : weekStart(now));

export interface ObjectiveProgress extends Objective { cycles: number; ms: number; hit: boolean }

/** Cycles and focus under each objective's label during its week. */
export function objectiveProgress(tasks: Tasks, plan: WeekPlan): ObjectiveProgress[] {
  const from = keyTime(plan.week), to = addDays(from, 7);
  const out = plan.objectives.map((o) => ({ ...o, cycles: 0, ms: 0, hit: false }));
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    if (s.at < from || s.at >= to) continue;
    const o = out.find((x) => sameLabel(x.label, sessionProject(t, s)));
    if (!o) continue;
    o.ms += s.ms || 0;
    if (s.full) o.cycles++;
  }
  for (const o of out) o.hit = o.cycles >= o.target;
  return out;
}

/** The objective a task counts toward, by its label. */
export const objectiveFor = (plan: WeekPlan | null, t: Task): Objective | null => {
  const name = projectOf(t);
  return (name && plan && plan.objectives.find((o) => sameLabel(o.label, name))) || null;
};

const dayOf = (t: Task, tk: DayKey) => t.plan || (t.today ? tk : "");

/** Open one-off tasks planned for a day before `week`. Recurring ones move forward by themselves. */
export const weekLeftovers = (tasks: Iterable<Task>, week: DayKey, tk: DayKey): Task[] =>
  [...tasks]
    .filter((t) => !t.done && !t.system && !t.repeat && !!dayOf(t, tk) && dayOf(t, tk) < week)
    .sort((a, b) => dayOf(a, tk).localeCompare(dayOf(b, tk)) || (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));

export type Fate = "week" | "later" | "drop";

/** A leftover rolled into the planned week, or moved to Later. A week already under way means today. */
export function settle(t: Task, fate: Exclude<Fate, "drop">, week: DayKey, tk: DayKey): Task {
  if (fate === "week" && week <= tk) return carriedOver(t, tk);
  const n: Task = { ...t, today: false };
  delete n.section;
  if (fate === "week") n.plan = week; else delete n.plan;
  return n;
}

/** Where a dropped task's focus goes so the history keeps it: each session into its month's unplanned bucket, label kept. */
export function rehome(t: Task, bucket: (at: number) => Task): Task[] {
  const out = new Map<string, Task>();
  for (const s of t.sessions || []) {
    const b = bucket(s.at), u = out.get(b.id) || { ...b, sessions: [...(b.sessions || [])] };
    const name = sessionProject(t, s);
    u.sessions!.push(name ? { ...s, project: name } : { ...s });
    out.set(u.id, u);
  }
  for (const u of out.values()) u.sessions!.sort((a, b) => a.at - b.at);
  return [...out.values()];
}

export interface LabelChoice { name: string; cycles: number; ms: number }

/** Labels to pick objectives from, those with the most focus in `week` first. */
export function labelChoices(tasks: Tasks, labels: Label[], week: DayKey): LabelChoice[] {
  const from = keyTime(week), to = addDays(from, 7), by = new Map<string, LabelChoice>();
  const add = (name: string) => {
    const key = name.toLocaleLowerCase();
    if (!by.has(key)) by.set(key, { name, cycles: 0, ms: 0 });
    return by.get(key)!;
  };
  for (const l of labels) if (!l.archived && l.name.trim()) add(l.name);
  for (const t of tasks.values()) for (const s of t.sessions || []) {
    const name = sessionProject(t, s);
    if (!name || s.at < from || s.at >= to || labels.some((l) => l.archived && sameLabel(l.name, name))) continue;
    const c = add(name);
    c.ms += s.ms || 0;
    if (s.full) c.cycles++;
  }
  const used = (name: string) => labels.find((l) => sameLabel(l.name, name))?.lastUsed || 0;
  return [...by.values()].sort((a, b) => b.ms - a.ms || used(b.name) - used(a.name) || a.name.localeCompare(b.name));
}

/** A starting target: what the label got last week, or four cycles. */
export const suggestTarget = (cycles: number) => Math.max(TARGET.min, Math.min(TARGET.max, cycles || 4));

/** The week to offer planning for: Sunday to Tuesday, while it has no plan and wasn't waved off. */
export function offerDue(now: number, plans: WeekPlan[], seen: string | undefined): DayKey | null {
  if (![6, 0, 1].includes(weekday(now))) return null;
  const week = dayKey(planWeek(now));
  return planOf(plans, week) || seen === week ? null : week;
}
