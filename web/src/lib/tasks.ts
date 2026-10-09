import type { DayKey } from "./dates";
import { isHue, LABEL_HUES, type Label } from "./labels";
import type { Repeat } from "./repeat";

export interface Session {
  at: number;
  ms?: number;
  full?: boolean;
  /** Overrides the task's label for this session; "" means no label. */
  project?: string;
  /** The timer run that logged it, so two synced devices log a cycle once. */
  run?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done?: boolean;
}

export interface Task {
  id: string;
  title: string;
  est?: number;
  done?: boolean;
  doneAt?: number | null;
  createdAt?: number;
  system?: boolean;
  sample?: boolean;
  project?: string;
  plan?: DayKey;
  /** Planned for today, or for a section of Today. */
  today?: boolean;
  section?: string;
  order?: number;
  notes?: string;
  updatedAt?: number;
  sessions?: Session[];
  subtasks?: Subtask[];
  repeat?: Repeat;
  /** The first occurrence's id, shared by every occurrence of a recurring task. */
  series?: string;
  /** A recurring task on hold, until a day or, without one, until it's resumed. */
  paused?: { until?: DayKey };
}

export type Tasks = Map<string, Task>;

/** "" for everything, "none" for unlabeled, or "project:<name>". */
export type LabelFilter = string;

export const cyclesOf = (t: Task) => (t.sessions || []).filter((s) => s.full).length;
export const timeOf = (t: Task) => (t.sessions || []).reduce((a, s) => a + (s.ms || 0), 0);

export const projectOf = (t: { project?: unknown }) => (typeof t.project === "string" ? t.project.trim() : "");
export const sessionProject = (t: Task, s: Session) => (Object.prototype.hasOwnProperty.call(s, "project") ? projectOf(s) : projectOf(t));

export const matchesLabel = (name: string, f: LabelFilter) => !f || (f === "none" ? !name : name === f.slice(8));
export const matchLabel = (t: Task, f: LabelFilter) => matchesLabel(projectOf(t), f);

const byName = (a: string, b: string) => a.localeCompare(b);

/** Labels on tasks, sorted. */
export const projectNames = (tasks: Tasks) => [...new Set([...tasks.values()].filter((t) => !t.system).map(projectOf).filter(Boolean))].sort(byName);

/** Labels on tasks or on any of their sessions, sorted. */
export const progressLabelNames = (tasks: Tasks) =>
  [...new Set([...projectNames(tasks), ...[...tasks.values()].flatMap((t) => (t.sessions || []).map((s) => sessionProject(t, s))).filter(Boolean)])].sort(byName);

/** Tasks narrowed to the sessions that count for a label filter; a task stays if it has any, or carries the label itself. */
export function focusTasks(tasks: Tasks, filter: LabelFilter): Tasks {
  if (!filter) return tasks;
  return new Map(
    [...tasks]
      .map(([id, t]): [string, Task] => [id, { ...t, sessions: (t.sessions || []).filter((s) => matchesLabel(sessionProject(t, s), filter)) }])
      .filter(([, t]) => t.sessions!.length || matchLabel(t, filter)),
  );
}

// Labels made before colours could be picked keep the colour their name always gave them.
const HASH_HUES = [25, 60, 100, 150, 195, 245, 290, 335];
const chosen = new Map<string, number>();

/** Remembers each label's own colour, so every view paints it the same way. */
export function setLabelHues(labels: Label[]) {
  chosen.clear();
  for (const l of labels) if (l && typeof l.name === "string" && isHue(l.hue)) chosen.set(l.name.toLocaleLowerCase(), l.hue);
}

/** A label's colour, the same in any letter case. */
export function labelHue(name: string): number {
  const own = chosen.get(name.toLocaleLowerCase());
  if (own != null) return own;
  let h = 0;
  for (const c of name.toLocaleLowerCase()) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return HASH_HUES[h % HASH_HUES.length];
}

/** The colour fewest of the visible labels use, so a new label stands apart from the rest. */
export function nextLabelHue(labels: Label[]): number {
  const used = new Map(LABEL_HUES.map((h) => [h, 0]));
  for (const l of labels) if (!l.archived) { const h = labelHue(l.name); used.set(h, (used.get(h) || 0) + 1); }
  return LABEL_HUES.reduce((best, h) => (used.get(h)! < used.get(best)! ? h : best), LABEL_HUES[0]);
}
