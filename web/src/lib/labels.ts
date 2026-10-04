export interface Label {
  name: string;
  lastUsed?: number;
  archived?: boolean;
  updatedAt?: number;
}

export interface LabelOption {
  name: string;
  create?: boolean;
  clear?: boolean;
  archived?: boolean;
}

export const sameLabel = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Labels that aren't hidden and contain `q`, those starting with it first. */
export function labelMatches(labels: Label[], q: string): Label[] {
  q = q.toLocaleLowerCase();
  const starts = (l: Label) => (l.name.toLocaleLowerCase().startsWith(q) ? 0 : 1);
  return labels.filter((l) => !l.archived && l.name.toLocaleLowerCase().includes(q)).sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
}

/** What the label picker lists for a query, and which row starts highlighted (-1 for none). */
export function labelOptions(labels: Label[], o: { query: string; value: string; hash?: boolean; manage?: boolean }): { opts: LabelOption[]; idx: number } {
  if (o.manage) return { opts: [...labels].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ name: l.name, archived: !!l.archived })), idx: -1 };
  const q = o.query.trim();
  const opts: LabelOption[] = labelMatches(labels, q).map((l) => ({ name: l.name }));
  const first = opts.length ? 0 : -1;
  if (q && !opts.some((x) => sameLabel(x.name, q))) opts.push({ name: q, create: true });
  if (!q && o.value) opts.unshift({ name: "", clear: true });
  let idx = q ? first : opts.findIndex((x) => !x.clear && sameLabel(x.name, o.value));
  // "#12" in a title is far more often an issue number than a new label
  if (idx < 0 && opts.length && !(o.hash && /^\d+$/.test(q))) idx = opts.findIndex((x) => !x.clear);
  return { opts, idx };
}

/** Labels from both lists by name, the newer edit winning. */
export function mergeLabels(a: Label[], b: Label[]): Label[] {
  const byName = new Map<string, Label>();
  for (const label of [...a, ...b]) {
    if (!label || typeof label.name !== "string" || !label.name.trim()) continue;
    const name = label.name.trim().slice(0, 80), key = name.toLocaleLowerCase(), old = byName.get(key);
    if (!old || (label.updatedAt || 0) >= (old.updatedAt || 0)) byName.set(key, { name, lastUsed: Number(label.lastUsed) || 0, archived: !!label.archived, updatedAt: Number(label.updatedAt) || 0 });
  }
  return [...byName.values()];
}
