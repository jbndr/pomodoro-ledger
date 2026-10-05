/** Tasks picked for a bulk edit, plus the last one clicked, which Shift-click ranges start from. */
export const picked = $state({ ids: [] as string[], anchor: "" });

export function togglePick(id: string) {
  picked.ids = picked.ids.includes(id) ? picked.ids.filter((x) => x !== id) : [...picked.ids, id];
  picked.anchor = id;
}

export function clearPicks() {
  picked.ids = [];
  picked.anchor = "";
}
