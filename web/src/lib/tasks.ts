import type { DayKey } from "./dates";

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

const LABEL_HUES = [25, 60, 100, 150, 195, 245, 290, 335];

/** A stable colour for a label name, the same in any letter case. */
export function labelHue(name: string): number {
  let h = 0;
  for (const c of name.toLocaleLowerCase()) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return LABEL_HUES[h % LABEL_HUES.length];
}
