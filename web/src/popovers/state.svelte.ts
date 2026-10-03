/** Which popovers are open, readable by the non-Svelte code even before they mount. */
export const whenPop = $state({ hidden: true });
export const labelPop = $state({ hidden: true });
export const pop = $state({ hidden: true });
/** Who the label picker is open for: "new", "hash", "row:<id>" or "session:<key>". Kept after it closes. */
export const LP = $state({ key: "" });
