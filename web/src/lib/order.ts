/** One row of the task list: a heading that starts a group, or a task. */
export type Entry = { kind: "group"; g: string; end?: string } | { kind: "task"; id: string };

export interface Placement {
  id: string;
  g: string;
  /** Last day of a month heading's range, when the task sits under one. */
  end: string;
  order: number;
}

const indexOf = (list: Entry[], id: string) => list.findIndex((e) => e.kind === "task" && e.id === id);

function moveTo(list: Entry[], from: number, to: number): Entry[] {
  const next = [...list];
  const [e] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, e);
  return next;
}

/** The group a list position belongs to: the closest heading above it. */
export function groupAt(list: Entry[], index: number, fallback: string): string {
  for (let i = Math.min(index, list.length) - 1; i >= 0; i--) {
    const e = list[i];
    if (e.kind === "group") return e.g;
  }
  return fallback;
}

/** Moves a task one place; stepping past a heading moves it into the neighbouring group. Null when it can't move. */
export function step(list: Entry[], id: string, up: boolean): Entry[] | null {
  const i = indexOf(list, id);
  if (i < 0) return null;
  if (up) return i === 0 || (i === 1 && list[0].kind === "group") ? null : moveTo(list, i, i - 1);
  return i === list.length - 1 ? null : moveTo(list, i + 1, i);
}

/** Moves a task to the end of the previous group, or the top of the next one. Null when there's nowhere to go. */
export function jump(list: Entry[], id: string, up: boolean): Entry[] | null {
  const i = indexOf(list, id);
  if (i < 0) return null;
  let head = -1;
  for (let j = i - 1; j >= 0; j--) if (list[j].kind === "group") { head = j; break; }
  if (up) return head <= 0 ? null : moveTo(list, i, head);
  const next = list.findIndex((e, j) => j > i && e.kind === "group");
  return next < 0 ? null : moveTo(list, i, next + 1);
}

/** Moves the given tasks to the top of the group each one is in, keeping their order among themselves. Null when nothing moves. */
export function toTop(list: Entry[], ids: string[]): Entry[] | null {
  const pick = new Set(ids), out: Entry[] = [];
  let block: Entry[] = [];
  const flush = () => { out.push(...block.filter((e) => e.kind === "task" && pick.has(e.id)), ...block.filter((e) => !(e.kind === "task" && pick.has(e.id)))); block = []; };
  for (const e of list) { if (e.kind === "task") block.push(e); else { flush(); out.push(e); } }
  flush();
  return out.every((e, i) => e === list[i]) ? null : out;
}

/** Moves a task to sit right before list position `before`, or at the end for null. */
export function place(list: Entry[], id: string, before: number | null): Entry[] {
  const i = indexOf(list, id);
  return i < 0 ? list : moveTo(list, i, before ?? list.length);
}

/** Where every task lands when the list is saved in this order. */
export function placements(list: Entry[], fallback: string): Placement[] {
  const out: Placement[] = [];
  let g = fallback, end = "";
  for (const e of list) {
    if (e.kind === "group") { g = e.g; end = e.end || ""; }
    else out.push({ id: e.id, g, end, order: out.length });
  }
  return out;
}
