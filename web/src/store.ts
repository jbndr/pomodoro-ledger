import { toast } from "./chrome/notice.svelte";
import { Cloud } from "./cloud";
import { autoFloatHandler } from "./float";
import type { Label } from "./lib/labels";
import { projectOf, sessionProject } from "./lib/tasks";
import { renderAll, renderPill, renderStats, renderTimer } from "./render";
import { clone, DEF, ls, S, type Settings, type Task } from "./state";
import { markStarted } from "./tasks/derived";
import { newDay } from "./tasks/rollover";
import { fillSettings, refreshLabelPop } from "./ui";

export interface Profile { settings?: Partial<Settings>; labels?: Label[] }
export type SyncError = { code?: string } | undefined;
export interface Collection {
  onSnapshot(cb: (snap: { docs: { id: string; exists: boolean; data(): Task }[] }) => void, err: (e: SyncError) => void): void;
  doc(id: string): { set(body: Task): Promise<unknown>; delete(): Promise<unknown> };
}
export interface ProfileDoc {
  onSnapshot(cb: (d: { exists: boolean; data(): Profile | undefined }) => void, err?: () => void): void;
  set(body: Profile): Promise<unknown>;
}

/** Tasks changed while not connected, pushed on the first snapshot if they're newer than the account's copy. */
const dirty = new Set<string>();

/** Saves to the account db when available, this browser otherwise. */
export const Store = {
  col: null as Collection | null, prof: null as ProfileDoc | null, chains: {} as Record<string, Promise<unknown>>, setTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  loadLocal() {
    ls.get<Task[]>("pl.tasks", []).forEach((t) => t && t.id && S.tasks.set(t.id, t));
    S.settings = { ...DEF, ...ls.get("pl.settings", {}) };
    S.labels = Array.isArray(ls.get("pl.labels", [])) ? ls.get("pl.labels", []) : [];
    Labels.merge([]);
  },
  cache() { ls.set("pl.tasks", [...S.tasks.values()]); ls.set("pl.settings", S.settings); ls.set("pl.labels", S.labels); },
  async connect() {
    if (window.claude && typeof window.claude.use === "function") {
      let db, user, uid, prof, col;
      try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch { return; }
      if (!db || !user) return;
      try { uid = await user.id(); } catch {}
      if (!uid) return;
      try { prof = db.doc("data/users/" + uid + "/profile"); col = prof.collection("tasks"); } catch { return; }
      return this.attach(prof, col);
    }
    const cloud = await Cloud.start();
    if (cloud) this.attach(cloud.prof, cloud.col);
  },
  attach(prof: ProfileDoc, col: Collection) {
    this.prof = prof; this.col = col;
    let first = true;
    col.onSnapshot((snap) => {
      const next = new Map<string, Task>(), synced = first;
      snap.docs.forEach((d) => { if (d.exists) next.set(d.id, clone(d.data())); });
      if (first) {
        first = false;
        for (const id of dirty) {
          const mine = S.tasks.get(id), theirs = next.get(id);
          if (mine && (!theirs || (theirs.updatedAt || 0) < (mine.updatedAt || 0))) { next.set(id, mine); this.write(mine); }
        }
        dirty.clear();
        S.storeMode = "db";
      }
      S.tasks = next;
      if (S.tasks.size) markStarted(true);
      this.cache(); renderAll();
      if (synced) newDay();
    }, (e) => { S.storeMode = "local"; renderPill(); if (e && e.code !== "revoked") toast("Sync paused. Your changes are kept in this browser for now."); });
    prof.onSnapshot((d) => {
      if (!d.exists) return;
      const b = d.data() || {};
      if (Array.isArray(b.labels)) { Labels.merge(b.labels); Store.cache(); refreshLabelPop(); }
      if (b.settings) { S.settings = { ...DEF, ...b.settings }; this.cache(); fillSettings(); autoFloatHandler(); renderTimer(true); renderStats(); }
    }, () => {});
  },
  write(t: Task) {
    const col = this.col;
    if (!col) return;
    const id = t.id, body = clone(t);
    this.chains[id] = (this.chains[id] || Promise.resolve())
      .then(() => col.doc(id).set(body))
      .catch((e) => this.fail(e));
  },
  fail(e: SyncError) {
    const c = e && e.code;
    if (c === "quota_exceeded") toast("Storage is full. Delete a few old tasks to keep saving.");
    else if (c === "invalid_argument") { toast("You can view this ledger but not save to it."); }
    else toast("Couldn't save that change. Check your connection and try again.");
  },
  saveTask(t: Task, render = true) {
    t.updatedAt = Date.now();
    S.tasks.set(t.id, t);
    this.cache();
    if (S.storeMode === "db") this.write(t); else dirty.add(t.id);
    if (render) renderAll();
  },
  saveTasks(list: Task[]) {
    const now = Date.now();
    list.forEach((t) => { t.updatedAt = now; S.tasks.set(t.id, t); if (S.storeMode === "db") this.write(t); else dirty.add(t.id); });
    this.cache(); renderAll();
  },
  deleteTask(id: string) {
    S.tasks.delete(id); dirty.delete(id); this.cache();
    const col = this.col;
    if (S.storeMode === "db" && col) {
      this.chains[id] = (this.chains[id] || Promise.resolve()).then(() => col.doc(id).delete()).catch((e) => this.fail(e));
    } else if (Cloud.email) Cloud.queueDelete(id, Date.now());
    renderAll();
  },
  saveSettings() {
    this.cache(); ls.set("pl.profileAt", Date.now());
    clearTimeout(this.setTimer);
    this.setTimer = setTimeout(() => {
      const prof = this.prof;
      if (S.storeMode === "db" && prof) {
        this.chains._p = (this.chains._p || Promise.resolve()).then(() => prof.set({ settings: clone(S.settings), labels: clone(S.labels) })).catch((e) => this.fail(e));
      }
    }, 700);
  },
};

export const Labels = {
  merge(list: Label[]) {
    const byName = new Map<string, Label>();
    for (const label of [...S.labels, ...list]) {
      if (!label || typeof label.name !== "string" || !label.name.trim()) continue;
      const name = label.name.trim().slice(0, 80), key = name.toLocaleLowerCase(), old = byName.get(key);
      if (!old || (label.updatedAt || 0) >= (old.updatedAt || 0)) byName.set(key, { name, lastUsed: Number(label.lastUsed) || 0, archived: !!label.archived, updatedAt: Number(label.updatedAt) || 0 });
    }
    S.labels = [...byName.values()];
  },
  importTasks(tasks: Map<string, Task>) {
    let changed = false;
    for (const t of tasks.values()) {
      for (const name of [projectOf(t), ...(t.sessions || []).map((s) => sessionProject(t, s))]) {
        if (!name || S.labels.some((l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
        S.labels.push({ name, lastUsed: t.updatedAt || t.createdAt || 0, archived: false, updatedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) Store.saveSettings();
  },
  add(name: string, used = false) {
    name = name.trim().slice(0, 80);
    if (!name) return "";
    let label = S.labels.find((l) => l.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!label) { label = { name, lastUsed: 0, archived: false }; S.labels.push(label); }
    label.archived = false;
    label.updatedAt = Date.now();
    if (used) label.lastUsed = Date.now();
    Store.saveSettings(); refreshLabelPop();
    return label.name;
  },
  use(name: string) { return this.add(name, true); },
};
