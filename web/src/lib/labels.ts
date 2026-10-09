export interface Label {
  name: string;
  lastUsed?: number;
  archived?: boolean;
  updatedAt?: number;
  /** A hue from LABEL_HUES, picked by the person or given when the label was made. */
  hue?: number;
}

/** The label colours, in the order new labels take them. Orange is the focus colour, so it comes last. */
export const LABEL_HUES = [290, 195, 335, 245, 150, 75, 45, 15];
export const HUE_NAMES: Record<number, string> = { 290: "Violet", 195: "Teal", 335: "Pink", 245: "Blue", 150: "Green", 75: "Gold", 45: "Orange", 15: "Red" };
export const isHue = (h: unknown): h is number => typeof h === "number" && LABEL_HUES.includes(h);

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
    if (!old || (label.updatedAt || 0) >= (old.updatedAt || 0)) byName.set(key, { name, lastUsed: Number(label.lastUsed) || 0, archived: !!label.archived, updatedAt: Number(label.updatedAt) || 0, ...(isHue(label.hue) ? { hue: label.hue } : {}) });
  }
  return [...byName.values()];
}
