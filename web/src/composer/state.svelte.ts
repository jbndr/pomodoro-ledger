let version = $state(0);

/** Lets the non-Svelte code redraw the composer after changing what it shows: the new-task fields in S, settings or the view. */
export const composer = {
  get version() { return version; },
  refresh() { version++; },
};
