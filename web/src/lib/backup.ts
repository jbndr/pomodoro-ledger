import { dayKey } from "./dates";
import { mergeLabels, type Label } from "./labels";
import type { Session, Subtask, Task } from "./tasks";

/** The same format the account export uses, so a file from either imports. */
export const FORMAT = "pomodoro-ledger/1";

type Settings = Record<string, unknown>;
export type ImportMode = "merge" | "replace";

export interface FileDoc { kind: "task" | "profile" | "timer"; id: string; at: number; body: unknown }
export interface LedgerFile { format: string; email: string; exportedAt: number; docs: FileDoc[] }

export interface Ledger { tasks: Map<string, Task>; settings: Settings; labels: Label[]; profileAt: number }

export interface Imported {
  tasks: Task[];
  profile: { settings: Settings; labels: Label[]; at: number } | null;
  exportedAt: number;
  skipped: number;
}

export type Parsed = { ok: true; data: Imported } | { ok: false; error: string };

export const fileName = (now: number) => "pomodoro-ledger-" + dayKey(now) + ".json";

export function buildFile(o: Ledger & { email?: string; timer?: unknown; now: number }): LedgerFile {
  const docs: FileDoc[] = [...o.tasks.values()]
    .filter((t) => t && t.id && !t.sample)
    .map((t) => ({ kind: "task" as const, id: t.id, at: t.updatedAt || t.createdAt || o.now, body: t }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  docs.unshift({ kind: "profile", id: "profile", at: o.profileAt || 1, body: { settings: o.settings, labels: o.labels } });
  if (o.timer) docs.push({ kind: "timer", id: "timer", at: o.now, body: o.timer });
  return JSON.parse(JSON.stringify({ format: FORMAT, email: o.email || "", exportedAt: o.now, docs }));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function cleanTask(raw: unknown, at: number): Task | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || raw.id.length > 80 || typeof raw.title !== "string" || raw.sample) return null;
  const t = { ...raw } as unknown as Task;
  t.updatedAt = num(raw.updatedAt) || at;
  if ("sessions" in raw) t.sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).filter((s): s is Session => isObj(s) && num(s.at) > 0 && (s.ms == null || num(s.ms) >= 0));
  if ("subtasks" in raw) t.subtasks = (Array.isArray(raw.subtasks) ? raw.subtasks : []).filter((s): s is Subtask => isObj(s) && typeof s.id === "string" && typeof s.title === "string");
  return t;
}

const cleanLabels = (raw: unknown): Label[] =>
  (Array.isArray(raw) ? raw : []).filter((l): l is Label => isObj(l) && typeof l.name === "string" && !!l.name.trim());

/** Reads an exported file, or says in plain words why it can't. */
export function parseFile(text: string): Parsed {
  const bad = { ok: false as const, error: "This isn't a Pomodoro Ledger export. Pick the .json file you exported." };
  let f: unknown;
  try { f = JSON.parse(text); } catch { return bad; }
  if (!isObj(f) || typeof f.format !== "string") return bad;
  const m = /^pomodoro-ledger\/(\d+)$/.exec(f.format);
  if (!m) return bad;
  const v = +m[1];
  if (v > 1) return { ok: false, error: "This file comes from a newer version of Pomodoro Ledger. Reload the app and try again." };
  if (v < 1) return { ok: false, error: "This file is from an older version and can't be imported." };
  if (!Array.isArray(f.docs)) return { ok: false, error: "This file is incomplete, so nothing was imported." };

  const tasks = new Map<string, Task>();
  let profile: Imported["profile"] = null, skipped = 0;
  for (const d of f.docs) {
    if (!isObj(d)) { skipped++; continue; }
    const at = num(d.at);
    if (d.kind === "task") {
      const t = cleanTask(d.body, at);
      if (!t) { skipped++; continue; }
      const prev = tasks.get(t.id);
      if (!prev || (t.updatedAt || 0) > (prev.updatedAt || 0)) tasks.set(t.id, t);
    } else if (d.kind === "profile") {
      if (!isObj(d.body)) { skipped++; continue; }
      profile = { settings: isObj(d.body.settings) ? d.body.settings : {}, labels: cleanLabels(d.body.labels), at };
    }
  }
  if (!tasks.size && !profile) return { ok: false, error: "This export is empty, so there's nothing to import." };
  return { ok: true, data: { tasks: [...tasks.values()], profile, exportedAt: num(f.exportedAt), skipped } };
}

const count = (n: number, word: string) => n + " " + word + (n === 1 ? "" : "s");

/** What a file holds, for example "142 tasks, 380 sessions, 6 labels, settings". */
export function summary(d: Imported): string {
  const tasks = d.tasks.filter((t) => !t.system);
  const sessions = d.tasks.reduce((a, t) => a + (t.sessions || []).length, 0);
  const parts = [count(tasks.length, "task"), count(sessions, "session")];
  if (d.profile) parts.push(count(d.profile.labels.length, "label"), "settings");
  return parts.join(", ");
}

/** Keeps settings whose type matches the default, plus extra plain values. */
export function cleanSettings(raw: Settings, defaults: Settings): Settings {
  const out: Settings = {};
  for (const [k, v] of Object.entries(raw)) {
    const d = defaults[k];
    if (d === undefined ? ["string", "number", "boolean"].includes(typeof v) : Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d) out[k] = v;
  }
  return out;
}

const sessionKey = (s: Session) => s.run || String(s.at);

export interface Applied {
  tasks: Map<string, Task>;
  changed: Task[];
  removed: string[];
  settings: Settings;
  labels: Label[];
  profileChanged: boolean;
  settingsFromFile: boolean;
  added: number;
  updated: number;
}

/** Merge takes the newer copy of each task and keeps both copies' sessions; replace matches the file. */
export function applyImport(cur: Ledger, d: Imported, mode: ImportMode, defaults: Settings): Applied {
  const fileSettings = d.profile ? { ...defaults, ...cleanSettings(d.profile.settings, defaults) } : null;
  if (mode === "replace") {
    const tasks = new Map(d.tasks.map((t) => [t.id, t]));
    return {
      tasks, changed: d.tasks, removed: [...cur.tasks.keys()].filter((id) => !tasks.has(id)),
      settings: fileSettings || cur.settings, labels: d.profile ? mergeLabels([], d.profile.labels) : cur.labels, profileChanged: !!d.profile, settingsFromFile: !!d.profile,
      added: d.tasks.filter((t) => !cur.tasks.has(t.id)).length, updated: d.tasks.filter((t) => cur.tasks.has(t.id)).length,
    };
  }

  const owner = new Map<string, string>();
  for (const t of cur.tasks.values()) for (const s of t.sessions || []) owner.set(sessionKey(s), t.id);
  const tasks = new Map(cur.tasks), changed: Task[] = [];
  let added = 0, updated = 0;
  for (const theirs of d.tasks) {
    const mine = cur.tasks.get(theirs.id);
    const elsewhere = (s: Session) => { const o = owner.get(sessionKey(s)); return !!o && o !== theirs.id; };
    if (!mine) {
      const t = theirs.sessions ? { ...theirs, sessions: theirs.sessions.filter((s) => !elsewhere(s)) } : theirs;
      tasks.set(t.id, t); changed.push(t); added++;
      continue;
    }
    const fileWins = (theirs.updatedAt || 0) > (mine.updatedAt || 0);
    const win = fileWins ? theirs : mine, lose = fileWins ? mine : theirs;
    const seen = new Set<string>(), sessions: Session[] = [];
    let extra = false;
    for (const s of win.sessions || []) if (!seen.has(sessionKey(s)) && !elsewhere(s)) { seen.add(sessionKey(s)); sessions.push(s); }
    for (const s of lose.sessions || []) if (!seen.has(sessionKey(s)) && !elsewhere(s)) { seen.add(sessionKey(s)); sessions.push(s); extra = true; }
    if (extra) sessions.sort((a, b) => a.at - b.at);
    const t: Task = win.sessions || sessions.length ? { ...win, sessions } : { ...win };
    if (JSON.stringify(t) === JSON.stringify(mine)) continue;
    tasks.set(t.id, t); changed.push(t); updated++;
  }

  const untouched = Object.entries(cur.settings).every(([k, v]) => k === "recapSeen" || k === "planSeen" || JSON.stringify(v) === JSON.stringify(defaults[k]));
  const fileProfileWins = !!d.profile && (d.profile.at > (cur.profileAt || 0) || untouched);
  const settings = fileProfileWins && fileSettings ? fileSettings : cur.settings;
  const labels = d.profile ? mergeLabels(cur.labels, d.profile.labels) : cur.labels;
  const profileChanged = settings !== cur.settings || JSON.stringify(labels) !== JSON.stringify(mergeLabels(cur.labels, []));
  return { tasks, changed, removed: [], settings, labels, profileChanged, settingsFromFile: settings !== cur.settings, added, updated };
}
