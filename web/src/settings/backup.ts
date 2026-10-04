import { Cloud } from "../cloud";
import { autoFloatHandler } from "../float";
import { applyImport, buildFile, fileName, type Imported, type ImportMode } from "../lib/backup";
import { renderAll } from "../render";
import { clone, DEF, ls, S, T, type Settings } from "../state";
import { Store } from "../store";
import { markStarted } from "../tasks/derived";
import { saveTimer } from "../timer/engine";
import { fillSettings, refreshLabelPop } from "../ui";

type Loose = Record<string, unknown>;

const current = () => ({ tasks: S.tasks, settings: S.settings as unknown as Loose, labels: S.labels, profileAt: ls.get("pl.profileAt", 0) });

export function exportLedger() {
  const now = Date.now();
  const file = buildFile({ ...current(), timer: { T: clone(T), activeId: S.activeId }, email: Cloud.email, now });
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName(now) });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const planImport = (d: Imported, mode: ImportMode) => applyImport(current(), d, mode, DEF as unknown as Loose);

/** Writes through Store, so a signed-in import syncs with fresh change times and wins over older copies. */
export function importLedger(d: Imported, mode: ImportMode) {
  const r = planImport(d, mode);
  for (const id of r.removed) Store.deleteTask(id, false);
  if (S.activeId && !r.tasks.has(S.activeId)) { S.activeId = null; saveTimer(); }
  if (r.profileChanged) {
    S.settings = r.settings as unknown as Settings; S.labels = r.labels;
    Store.saveSettings(); fillSettings(); refreshLabelPop(); autoFloatHandler();
  }
  markStarted(true);
  if (r.changed.length) Store.saveTasks(r.changed); else { Store.cache(); renderAll(); }
  return r;
}
