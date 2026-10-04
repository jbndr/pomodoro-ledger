import { toast } from "../chrome/notice.svelte";
import { clone, S } from "../state";
import { Labels, Store } from "../store";
import { openOf, unplanned } from "../tasks/derived";

/** A session by its "<task id>:<index>" key. */
function sesAt(key: string) {
  const k = key.lastIndexOf(":"), t = S.tasks.get(key.slice(0, k)), i = +key.slice(k + 1);
  return t && t.sessions && t.sessions[i] ? { t, i } : null;
}

export function deleteSession(key: string) {
  const r = sesAt(key); if (!r) return;
  const n = clone(r.t); n.sessions!.splice(r.i, 1);
  if (n.system && !n.sessions!.length) Store.deleteTask(n.id); else Store.saveTask(n);
  toast("Deleted that session.");
}

export function moveSession(key: string, toId: string) {
  const r = sesAt(key); if (!r) return;
  const s = r.t.sessions![r.i], dst = clone((toId && S.tasks.get(toId)) || unplanned(s.at));
  if (dst.id === r.t.id) return;
  const src = clone(r.t); src.sessions!.splice(r.i, 1);
  dst.sessions = [...(dst.sessions || []), clone(s)].sort((a, b) => a.at - b.at);
  if (src.system && !src.sessions!.length) { Store.deleteTask(src.id); Store.saveTask(dst); } else Store.saveTasks([src, dst]);
  toast("Moved to “" + dst.title + "”.");
}

export function labelSession(key: string, name: string) {
  const r = sesAt(key); if (!r) return;
  const task = clone(r.t), s = task.sessions![r.i];
  s.project = name ? Labels.use(name) : "";
  Store.saveTask(task);
  toast(name ? "Session labeled “" + s.project + "”." : "Label removed from this session.");
}

/** Where a session can move: no task, any open task, or a finished one. */
export function moveItems() {
  const fin = [...S.tasks.values()].filter((t) => t.done && !t.system).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return [{ id: "", title: "Unplanned focus (no task)" }]
    .concat(openOf(S.tasks).map((t) => ({ id: t.id, title: t.title })))
    .concat(fin.map((t) => ({ id: t.id, title: t.title + " (finished)" })));
}
